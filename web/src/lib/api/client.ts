import type { z } from 'zod';
import { ErrorCode, RequestAbortedError, RequestError } from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Checks the response's `data`; see ApiClient. */
  schema: z.ZodType;
  /** Sent as JSON, or as multipart when it is a FormData (file uploads). */
  body?: unknown;
  /** Undefined, null and empty-string values are left out. */
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  /** Where `/api/*` is proxied to the API (next.config.ts rewrites). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Any zod schema; a response checked with it resolves with the schema's output type. */
export type Schema = z.ZodType;

/**
 * Every verb takes the zod schema of its response (from `./schemas`) as the second argument. The
 * result is typed from the schema, and a response that does not match rejects with
 * `RequestError(BAD_RESPONSE)` instead of rendering missing data. There is no unchecked form: a
 * call whose body nobody reads passes `ignored`, which says so.
 */
export interface ApiClient {
  request<S extends Schema>(
    path: string,
    options: RequestOptions & { schema: S },
  ): Promise<z.output<S>>;
  get<S extends Schema>(
    path: string,
    schema: S,
    query?: Record<string, QueryValue>,
    signal?: AbortSignal,
  ): Promise<z.output<S>>;
  post<S extends Schema>(path: string, schema: S, body?: unknown): Promise<z.output<S>>;
  patch<S extends Schema>(path: string, schema: S, body: unknown): Promise<z.output<S>>;
  put<S extends Schema>(path: string, schema: S, body: unknown): Promise<z.output<S>>;
  delete<S extends Schema>(path: string, schema: S): Promise<z.output<S>>;
  /** Multipart POST; the browser sets the boundary. */
  postForm<S extends Schema>(path: string, schema: S, form: FormData): Promise<z.output<S>>;
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${base}${suffix}?${qs}` : `${base}${suffix}`;
}

function isEnvelope(
  value: unknown,
): value is { success: boolean; data?: unknown; error?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  );
}

/**
 * Typed fetch for the API envelope. Resolves with `data` of `{ success: true, data }`; rejects
 * with a `RequestError` for `{ success: false, error }`, network failures and non-envelope answers.
 * Cookies ride along automatically: the API is same-origin through the `/api` rewrite.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '/api';
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function request(path: string, opts: RequestOptions): Promise<unknown> {
    const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = { accept: 'application/json' };
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body !== undefined && !isForm) headers['content-type'] = 'application/json';
    let body: BodyInit | undefined;
    if (isForm) body = opts.body as FormData;
    else if (opts.body !== undefined) body = JSON.stringify(opts.body);

    let response: Response;
    try {
      response = await doFetch(buildUrl(baseUrl, path, opts.query), {
        method,
        headers,
        body,
        credentials: 'same-origin',
        signal: opts.signal,
      });
    } catch (cause) {
      if (opts.signal?.aborted || (cause as { name?: unknown } | null)?.name === 'AbortError') {
        throw new RequestAbortedError();
      }
      throw new RequestError(ErrorCode.NETWORK_ERROR);
    }

    const requestId = response.headers.get('x-request-id');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!isEnvelope(payload)) {
      throw new RequestError(ErrorCode.BAD_RESPONSE, {
        message: `Unexpected response (HTTP ${response.status})`,
        status: response.status,
        requestId,
      });
    }
    if (payload.success) {
      const parsed = opts.schema.safeParse(payload.data);
      if (parsed.success) return parsed.data;
      // The API and the app disagree about a shape: fail loudly, with the details for debugging.
      console.error(`Unexpected response shape from ${method} ${path}`, parsed.error.issues);
      throw new RequestError(ErrorCode.BAD_RESPONSE, {
        message: 'The server sent something this page cannot show',
        info: parsed.error.issues,
        status: response.status,
        requestId,
      });
    }

    const error = (payload.error ?? {}) as {
      name?: unknown;
      message?: unknown;
      info?: unknown;
      extended?: unknown;
    };
    throw new RequestError(typeof error.name === 'string' ? error.name : ErrorCode.BAD_RESPONSE, {
      message: typeof error.message === 'string' ? error.message : undefined,
      info: error.info,
      extended: error.extended,
      status: response.status,
      requestId,
    });
  }

  // `request` is untyped inside; the ApiClient interface types each verb from its schema.
  const client = {
    request: (path: string, options: RequestOptions) => request(path, options),
    get: (path: string, schema: Schema, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
      request(path, { method: 'GET', schema, query, signal }),
    post: (path: string, schema: Schema, body?: unknown) =>
      request(path, { method: 'POST', schema, body: body ?? {} }),
    patch: (path: string, schema: Schema, body: unknown) =>
      request(path, { method: 'PATCH', schema, body }),
    put: (path: string, schema: Schema, body: unknown) =>
      request(path, { method: 'PUT', schema, body }),
    delete: (path: string, schema: Schema) => request(path, { method: 'DELETE', schema }),
    postForm: (path: string, schema: Schema, form: FormData) =>
      request(path, { method: 'POST', schema, body: form }),
  };
  return client as ApiClient;
}

/** The browser's client. */
export const api = createApiClient();
