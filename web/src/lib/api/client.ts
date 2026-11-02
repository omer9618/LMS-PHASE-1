import { ApiError } from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. */
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

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
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

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await doFetch(buildUrl(baseUrl, path, opts.query), {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
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
    if (payload.success) return payload.data as T;

    const error = (payload.error ?? {}) as { name?: unknown; message?: unknown; info?: unknown };
    throw new ApiError(
      typeof error.name === 'string' ? error.name : 'BAD_RESPONSE',
      typeof error.message === 'string' ? error.message : 'Request failed',
      { info: error.info, status: response.status, requestId },
    );
  }

  return {
    request,
    get: (path, query, signal) => request(path, { method: 'GET', query, signal }),
    post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  };
}

/** The browser's client. */
export const api = createApiClient();
