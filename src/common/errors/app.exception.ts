import { ERROR_DEFINITIONS, ErrorCode } from './error-codes';

/**
 * The one exception services throw. Status and default message come from ERROR_DEFINITIONS.
 *
 * - `info`: safe, client-facing detail (e.g. which field, which id).
 * - `extended`: extra structured detail, also returned to the client. Never put secrets here.
 * - `options.cause`: the underlying error. Logged, never returned to the client.
 */
export class AppException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly info?: unknown,
    readonly extended?: unknown,
    options?: { message?: string; cause?: unknown },
  ) {
    super(options?.message ?? ERROR_DEFINITIONS[code].message, { cause: options?.cause });
    this.name = code;
    this.status = ERROR_DEFINITIONS[code].status;
  }
}
