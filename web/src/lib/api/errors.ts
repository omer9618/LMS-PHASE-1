/**
 * The app's error model, mirroring the API's (src/common/errors/error-codes.ts):
 *
 * - `ErrorCode`: every code the API can send in `error.name`, plus the two the client makes itself
 *   (NETWORK_ERROR, BAD_RESPONSE). `src/common/errors/error-codes.spec.ts` in the API checks that
 *   this list and the statuses below match the API's, so they cannot drift.
 * - `ERRORS`: one entry per code with its HTTP status and the sentence to show when the server sent
 *   no usable message. `fixed` entries always show that sentence (the server's detail is for logs,
 *   not people); `retry` entries are worth trying again (TanStack Query retries them).
 * - `RequestError`: the one error a failed API call rejects with, built from a code.
 * - `RequestAbortedError`: the request was cancelled by the page (navigation, unmount, a newer
 *   query). Not a RequestError: nobody is waiting for an answer, so it is never shown.
 */

export const ErrorCode = {
  // Generic
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UPLOAD_REJECTED: 'UPLOAD_REJECTED',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MFA_REQUIRED: 'MFA_REQUIRED',
  INVALID_MFA_CODE: 'INVALID_MFA_CODE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  // Courses
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  PUBLISH_GUARD_FAILED: 'PUBLISH_GUARD_FAILED',
  COURSE_NOT_PRICEABLE: 'COURSE_NOT_PRICEABLE',
  COURSE_LOCKED: 'COURSE_LOCKED',
  COURSE_INCOMPLETE: 'COURSE_INCOMPLETE',
  // Content and enrollment
  ENROLLMENT_REQUIRED: 'ENROLLMENT_REQUIRED',
  ENROLLMENT_EXPIRED: 'ENROLLMENT_EXPIRED',
  ENROLLMENT_REFUSED: 'ENROLLMENT_REFUSED',
  VIDEO_NOT_READY: 'VIDEO_NOT_READY',
  // Orders, progress, assessment
  ORDER_REFUSED: 'ORDER_REFUSED',
  LESSON_LOCKED: 'LESSON_LOCKED',
  PROGRESS_REFUSED: 'PROGRESS_REFUSED',
  QUIZ_LOCKED: 'QUIZ_LOCKED',
  QUIZ_ATTEMPT_REFUSED: 'QUIZ_ATTEMPT_REFUSED',
  QUIZ_ATTEMPT_CLOSED: 'QUIZ_ATTEMPT_CLOSED',
  // Profiles, role context, money
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  ROLE_CONTEXT_REQUIRED: 'ROLE_CONTEXT_REQUIRED',
  VERIFICATION_REFUSED: 'VERIFICATION_REFUSED',
  LEDGER_REFUSED: 'LEDGER_REFUSED',
  PAYOUT_REFUSED: 'PAYOUT_REFUSED',
  // Client side only
  /** The request never got an answer (offline, DNS, API down). */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** The answer was not the API's envelope, or its data did not match the expected shape. */
  BAD_RESPONSE: 'BAD_RESPONSE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDefinition {
  /** HTTP status the API answers with (0: the client made this error itself). */
  status: number;
  /** What to tell the user when the server sent no message of its own. */
  message: string;
  /** Always show `message`, never the server's text. */
  fixed?: boolean;
  /** A later try may work (TanStack Query retries these). */
  retry?: boolean;
}

const TRY_AGAIN = 'Something went wrong on our side. Please try again.';

export const ERRORS: Record<ErrorCode, ErrorDefinition> = {
  BAD_REQUEST: { status: 400, message: 'That request was not valid.' },
  VALIDATION_FAILED: { status: 400, message: 'Please correct the fields marked below.' },
  UNAUTHENTICATED: { status: 401, message: 'Please sign in to continue.' },
  FORBIDDEN: { status: 403, message: 'You do not have permission to do this.' },
  NOT_FOUND: { status: 404, message: 'This could not be found. It may have been removed.' },
  ROUTE_NOT_FOUND: { status: 404, message: TRY_AGAIN, fixed: true },
  CONFLICT: { status: 409, message: 'This already exists.' },
  INVALID_REFERENCE: { status: 400, message: 'Something this refers to no longer exists.' },
  CONSTRAINT_VIOLATION: { status: 409, message: 'This change is not allowed.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'That is too large to upload.' },
  UPLOAD_REJECTED: { status: 400, message: 'The file was not accepted.' },
  CAPTCHA_FAILED: { status: 400, message: 'The human check failed. Please try it again.' },
  RATE_LIMITED: {
    status: 429,
    message: 'Too many attempts. Please wait a moment and try again.',
    fixed: true,
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'A service this needs is unavailable. Please try again shortly.',
    fixed: true,
    retry: true,
  },
  INTERNAL: { status: 500, message: TRY_AGAIN, fixed: true, retry: true },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password.' },
  INVALID_TOKEN: { status: 400, message: 'This link is invalid or has expired.' },
  MFA_REQUIRED: { status: 403, message: 'Set up two-step verification to continue.' },
  INVALID_MFA_CODE: { status: 401, message: 'That code is not right. Try again.' },
  EMAIL_NOT_VERIFIED: { status: 403, message: 'Verify your email address first.' },
  INVALID_STATE_TRANSITION: { status: 409, message: 'This is not allowed in its current state.' },
  PUBLISH_GUARD_FAILED: { status: 422, message: 'Set a price and commission, or make it free.' },
  COURSE_NOT_PRICEABLE: { status: 409, message: 'This course cannot be priced right now.' },
  COURSE_LOCKED: { status: 409, message: 'This course cannot be changed right now.' },
  COURSE_INCOMPLETE: { status: 422, message: 'The course is not ready to submit.' },
  ENROLLMENT_REQUIRED: { status: 403, message: 'Enroll in this course to open it.' },
  ENROLLMENT_EXPIRED: { status: 403, message: 'Your access to this course has ended.' },
  ENROLLMENT_REFUSED: { status: 409, message: 'You cannot enroll in this course.' },
  VIDEO_NOT_READY: { status: 409, message: 'This video is still processing.' },
  ORDER_REFUSED: { status: 409, message: 'This order cannot be placed.' },
  LESSON_LOCKED: { status: 403, message: 'This lesson is locked.' },
  PROGRESS_REFUSED: { status: 409, message: 'Your progress could not be saved.' },
  QUIZ_LOCKED: { status: 409, message: 'Students have attempted this quiz, so it is locked.' },
  QUIZ_ATTEMPT_REFUSED: { status: 409, message: 'You cannot start an attempt right now.' },
  QUIZ_ATTEMPT_CLOSED: { status: 409, message: 'This attempt has ended.' },
  PROFILE_INCOMPLETE: { status: 422, message: 'Add more detail before publishing.' },
  ROLE_CONTEXT_REQUIRED: { status: 403, message: 'Switch to the right role to do this.' },
  VERIFICATION_REFUSED: { status: 422, message: 'This payment decision is not valid.' },
  LEDGER_REFUSED: { status: 409, message: 'This entry cannot be recorded.' },
  PAYOUT_REFUSED: { status: 409, message: 'This payout action is not allowed.' },
  NETWORK_ERROR: {
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
    fixed: true,
    retry: true,
  },
  BAD_RESPONSE: { status: 0, message: TRY_AGAIN, fixed: true },
};

function isKnownCode(code: string): code is ErrorCode {
  return Object.hasOwn(ERRORS, code);
}

export interface RequestErrorOptions {
  /** The server's message; defaults to the code's catalog message. */
  message?: string;
  /** Client-facing detail from the API (`error.info`), e.g. validation issues. */
  info?: unknown;
  /** Extra structured detail from the API (`error.extended`). */
  extended?: unknown;
  /** HTTP status; defaults to the code's. */
  status?: number;
  requestId?: string | null;
}

/** A failed API call. Built from a code; status and fallback message come from `ERRORS`. */
export class RequestError extends Error {
  /** The code; a code the API added later still arrives here as a string. */
  override readonly name: ErrorCode | (string & {});
  readonly info: unknown;
  readonly extended: unknown;
  readonly status: number;
  readonly requestId: string | null;

  constructor(code: ErrorCode | (string & {}), options: RequestErrorOptions = {}) {
    const definition = isKnownCode(code) ? ERRORS[code] : undefined;
    super(options.message ?? definition?.message ?? TRY_AGAIN);
    this.name = code;
    this.info = options.info;
    this.extended = options.extended;
    this.status = options.status ?? definition?.status ?? 0;
    this.requestId = options.requestId ?? null;
  }

  /** The sentence to show a person. */
  get userMessage(): string {
    const definition = isKnownCode(this.name) ? ERRORS[this.name] : undefined;
    if (!definition) return this.message || TRY_AGAIN;
    return definition.fixed ? definition.message : this.message || definition.message;
  }

  /** Whether trying again later may work. */
  get retryable(): boolean {
    return isKnownCode(this.name) ? ERRORS[this.name].retry === true : false;
  }
}

/** The page cancelled the request; it has no answer to show. */
export class RequestAbortedError extends Error {
  constructor() {
    super('The request was cancelled');
    this.name = 'RequestAbortedError';
  }
}

export function isRequestError(value: unknown, code?: ErrorCode): value is RequestError {
  return value instanceof RequestError && (code === undefined || value.name === code);
}

/**
 * Per-field messages from a validation error, keyed by field path (`email`, `guardianPhone`).
 * Understands both shapes the API sends: Zod issues (`info.issues[]`) and domain rules that name
 * one field (`info.field`, e.g. the password policy).
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isRequestError(error, ErrorCode.VALIDATION_FAILED)) return {};
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
  if (error instanceof RequestError) return error.userMessage;
  return 'Something went wrong. Please try again.';
}
