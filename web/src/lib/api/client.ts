import type { z } from 'zod';
import { ApiError } from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Checks the response's `data`; see ApiClient. */
  schema?: z.ZodType;
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
 * Every verb has two forms. Pass a zod schema (from `./schemas`) as the second argument and the
 * response is checked against it: the result is typed from the schema, and a response that does
 * not match rejects with `ApiError('BAD_RESPONSE')` instead of rendering missing data. The form
 * without a schema is unchecked (`T` is trusted); it remains only for areas not yet moved to
 * schemas (docs/UI_PLAN.md, phase 1).
 */
export interface ApiClient {
  request<S extends Schema>(
    path: string,
    options: RequestOptions & { schema: S },
  ): Promise<z.output<S>>;
  request<T>(path: string, options?: RequestOptions): Promise<T>;

  get<S extends Schema>(
    path: string,
    schema: S,
    query?: Record<string, QueryValue>,
    signal?: AbortSignal,
  ): Promise<z.output<S>>;
  get<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T>;

  post<S extends Schema>(path: string, schema: S, body?: unknown): Promise<z.output<S>>;
  post<T>(path: string, body?: unknown): Promise<T>;

  patch<S extends Schema>(path: string, schema: S, body: unknown): Promise<z.output<S>>;
  patch<T>(path: string, body: unknown): Promise<T>;

  put<S extends Schema>(path: string, schema: S, body: unknown): Promise<z.output<S>>;
  put<T>(path: string, body: unknown): Promise<T>;

  delete<S extends Schema>(path: string, schema: S): Promise<z.output<S>>;
  delete<T>(path: string): Promise<T>;

  /** Multipart POST; the browser sets the boundary. */
  postForm<S extends Schema>(path: string, schema: S, form: FormData): Promise<z.output<S>>;
  postForm<T>(path: string, form: FormData): Promise<T>;
}

/** Tells a schema argument from a body or query object. */
export function isSchema(value: unknown): value is Schema {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { safeParse?: unknown }).safeParse === 'function'
  );
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
 * with an `ApiError` for `{ success: false, error }`, network failures and non-envelope answers.
 * Cookies ride along automatically: the API is same-origin through the `/api` rewrite.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '/api';
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));

  async function request(path: string, opts: RequestOptions = {}): Promise<unknown> {
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
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError('NETWORK_ERROR', 'The request could not be sent');
    }

    const requestId = response.headers.get('x-request-id');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    if (!isEnvelope(payload)) {
      throw new ApiError('BAD_RESPONSE', `Unexpected response (HTTP ${response.status})`, {
        status: response.status,
        requestId,
      });
    }
    if (payload.success) {
      if (!opts.schema) return payload.data;
      const parsed = opts.schema.safeParse(payload.data);
      if (parsed.success) return parsed.data;
      // The API and the app disagree about a shape: fail loudly, with the details for debugging.
      console.error(`Unexpected response shape from ${method} ${path}`, parsed.error.issues);
      throw new ApiError('BAD_RESPONSE', 'The server sent something this page cannot show', {
        info: parsed.error.issues,
        status: response.status,
        requestId,
      });
    }

    const error = (payload.error ?? {}) as { name?: unknown; message?: unknown; info?: unknown };
    throw new ApiError(
      typeof error.name === 'string' ? error.name : 'BAD_RESPONSE',
      typeof error.message === 'string' ? error.message : 'Request failed',
      { info: error.info, status: response.status, requestId },
    );
  }

  // Each verb: (path, schema, ...rest) when the second argument is a schema, else unchecked.
  type Args = unknown[];
  const split = (args: Args): [Schema | undefined, Args] =>
    isSchema(args[0]) ? [args[0], args.slice(1)] : [undefined, args];

  const client = {
    request: (path: string, options?: RequestOptions) => request(path, options),
    get(path: string, ...args: Args) {
      const [schema, [query, signal]] = split(args);
      return request(path, {
        method: 'GET',
        schema,
        query: query as Record<string, QueryValue> | undefined,
        signal: signal as AbortSignal | undefined,
      });
    },
    post(path: string, ...args: Args) {
      const [schema, [body]] = split(args);
      return request(path, { method: 'POST', schema, body: body ?? {} });
    },
    patch(path: string, ...args: Args) {
      const [schema, [body]] = split(args);
      return request(path, { method: 'PATCH', schema, body });
    },
    put(path: string, ...args: Args) {
      const [schema, [body]] = split(args);
      return request(path, { method: 'PUT', schema, body });
    },
    delete(path: string, ...args: Args) {
      const [schema] = split(args);
      return request(path, { method: 'DELETE', schema });
    },
    postForm(path: string, ...args: Args) {
      const [schema, [form]] = split(args);
      return request(path, { method: 'POST', schema, body: form });
    },
  };
  // The overloads in ApiClient describe these variadic implementations.
  return client as ApiClient;
}

/** The browser's client. */
export const api = createApiClient();
