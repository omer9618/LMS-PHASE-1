/**
 * Error codes the API returns in `error.name` (src/common/errors/error-codes.ts in the API), plus
 * the two the client produces itself when no API answer could be read.
 */
export type KnownErrorName =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_REFERENCE'
  | 'CONSTRAINT_VIOLATION'
  | 'PAYLOAD_TOO_LARGE'
  | 'UPLOAD_REJECTED'
  | 'RATE_LIMITED'
  | 'CAPTCHA_FAILED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'MFA_REQUIRED'
  | 'INVALID_MFA_CODE'
  | 'ENROLLMENT_REQUIRED'
  | 'ENROLLMENT_EXPIRED'
  | 'ENROLLMENT_REFUSED'
  | 'VIDEO_NOT_READY'
  // Progress and assessment (#53, #75)
  | 'LESSON_LOCKED'
  | 'PROGRESS_REFUSED'
  | 'QUIZ_LOCKED'
  | 'QUIZ_ATTEMPT_REFUSED'
  | 'QUIZ_ATTEMPT_CLOSED'
  /** Client side: the request never got an answer (offline, DNS, API down). */
  | 'NETWORK_ERROR'
  /** Client side: the answer was not the API's JSON envelope (e.g. a proxy error page). */
  | 'BAD_RESPONSE';

/** Known codes autocomplete; codes added to the API later still type-check. */
export type ApiErrorName = KnownErrorName | (string & {});

/** A failed API call: `{ success: false, error: { name, message, info } }` as a typed error. */
export class ApiError extends Error {
  override readonly name: ApiErrorName;
  readonly info: unknown;
  /** HTTP status, or 0 when the request never got an answer. */
  readonly status: number;
  readonly requestId: string | null;

  constructor(
    name: ApiErrorName,
    message: string,
    options: { info?: unknown; status?: number; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = name;
    this.info = options.info;
    this.status = options.status ?? 0;
    this.requestId = options.requestId ?? null;
  }

  is(name: KnownErrorName): boolean {
    return this.name === name;
  }
}

export function isApiError(value: unknown, name?: KnownErrorName): value is ApiError {
  return value instanceof ApiError && (name === undefined || value.name === name);
}

/**
 * Per-field messages from a validation error, keyed by field path (`email`, `guardianPhone`).
 * Understands both shapes the API sends: Zod issues (`info.issues[]`) and domain rules that name
 * one field (`info.field`, e.g. the password policy).
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.name !== 'VALIDATION_FAILED') return {};
  const out: Record<string, string> = {};
  const info = error.info;
  if (info && typeof info === 'object') {
    const { issues, field } = info as { issues?: unknown; field?: unknown };
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        if (!issue || typeof issue !== 'object') continue;
        const { path, message } = issue as { path?: unknown; message?: unknown };
        if (typeof path === 'string' && typeof message === 'string' && !(path in out)) {
          out[path] = message;
        }
      }
    }
    if (typeof field === 'string' && !(field in out)) out[field] = error.message;
  }
  return out;
}

/** A sentence to show the user for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.name) {
      case 'NETWORK_ERROR':
        return 'Could not reach the server. Check your connection and try again.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'INTERNAL':
      case 'BAD_RESPONSE':
        return 'Something went wrong on our side. Please try again.';
      default:
        return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}
