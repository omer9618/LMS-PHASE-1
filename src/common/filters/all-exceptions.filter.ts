import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../errors/app.exception';
import { CONSTRAINT_MESSAGES } from '../errors/constraint-messages';
import { DomainError } from '../errors/domain.error';
import { ERROR_DEFINITIONS, ErrorCode, isErrorCode } from '../errors/error-codes';
import { redact } from '../logging/redact';

interface ErrorBody {
  status: number;
  name: string;
  message: string;
  info?: unknown;
  extended?: unknown;
}

/**
 * The single place errors become HTTP responses:
 * `{ success: false, error: { name, message, info, extended } }`.
 * Raw Prisma and driver errors never reach the client. 4xx is logged as warn, 5xx as error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const body = toErrorBody(exception);

    // Stack traces only for 5xx (or a 4xx wrapping an underlying cause); 4xx noise stays small.
    const hasCause = exception instanceof Error && exception.cause !== undefined;
    const logContext = {
      err: body.status >= 500 || hasCause ? exception : undefined,
      status: body.status,
      errorName: body.name,
      method: req.method,
      path: req.originalUrl,
      userId: (req as Request & { user?: { id: string } }).user?.id,
      body: redact(req.body),
    };
    if (body.status >= 500) this.logger.error(logContext, body.message);
    else this.logger.warn(logContext, body.message);

    if (res.headersSent) return;
    res.status(body.status).json({
      success: false,
      error: { name: body.name, message: body.message, info: body.info, extended: body.extended },
    });
  }
}

function fromCode(code: ErrorCode, info?: unknown, message?: string): ErrorBody {
  const def = ERROR_DEFINITIONS[code];
  return { status: def.status, name: code, message: message ?? def.message, info };
}

export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof AppException) {
    return {
      status: exception.status,
      name: exception.code,
      message: exception.message,
      info: exception.info,
      extended: exception.extended,
    };
  }

  if (exception instanceof DomainError) {
    const status = isErrorCode(exception.code) ? ERROR_DEFINITIONS[exception.code].status : 422;
    return { status, name: exception.code, message: exception.message, info: exception.info };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrismaError(exception);
  }

  if (exception instanceof HttpException) {
    return fromHttpException(exception);
  }

  // Errors raised by Express middleware before Nest routing (malformed JSON, body too large).
  const status = (exception as { status?: unknown })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return status === 413 ? fromCode(ErrorCode.PAYLOAD_TOO_LARGE) : fromCode(ErrorCode.BAD_REQUEST);
  }

  return fromCode(ErrorCode.INTERNAL);
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): ErrorBody {
  const constraint = constraintName(error);
  const info = constraint ? { constraint } : undefined;
  const message = constraint ? CONSTRAINT_MESSAGES[constraint] : undefined;

  switch (error.code) {
    case 'P2002':
      return fromCode(ErrorCode.CONFLICT, info, message);
    case 'P2003':
      return fromCode(ErrorCode.INVALID_REFERENCE, info, message);
    case 'P2025':
      return fromCode(ErrorCode.NOT_FOUND);
    default:
      if (driverCause(error)?.originalCode === '23514') {
        return fromCode(ErrorCode.CONSTRAINT_VIOLATION, info, message);
      }
      return fromCode(ErrorCode.INTERNAL);
  }
}

interface DriverCause {
  originalCode?: string;
  originalMessage?: string;
  constraint?: { index?: string; fields?: string[] };
}

function driverCause(error: Prisma.PrismaClientKnownRequestError): DriverCause | undefined {
  const meta = error.meta as { driverAdapterError?: { cause?: DriverCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

function constraintName(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const cause = driverCause(error);
  if (cause?.constraint?.index) return cause.constraint.index;
  return cause?.originalMessage?.match(/constraint "([^"]+)"/)?.[1];
}

function fromHttpException(exception: HttpException): ErrorBody {
  const status = exception.getStatus();
  switch (status) {
    case 400:
      return fromCode(ErrorCode.BAD_REQUEST);
    case 401:
      return fromCode(ErrorCode.UNAUTHENTICATED);
    case 403:
      return fromCode(ErrorCode.FORBIDDEN);
    case 404:
      return fromCode(ErrorCode.ROUTE_NOT_FOUND);
    case 413:
      return fromCode(ErrorCode.PAYLOAD_TOO_LARGE);
    default:
      return status >= 500
        ? fromCode(ErrorCode.INTERNAL)
        : { status, name: ErrorCode.BAD_REQUEST, message: exception.message };
  }
}
