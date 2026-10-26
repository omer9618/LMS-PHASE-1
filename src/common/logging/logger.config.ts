import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.schema';
import { PINO_REDACT_PATHS } from './redact';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_INCOMING_ID = /^[\w-]{1,64}$/;

/**
 * Structured JSON logs (pretty-printed in development). Every log line written during a request
 * carries `reqId`, which is also returned in the `x-request-id` response header, so a user-reported
 * failure can be traced from one id.
 */
export function buildLoggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      quietReqLogger: true,
      redact: { paths: PINO_REDACT_PATHS, censor: '[Redacted]' },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof incoming === 'string' && VALID_INCOMING_ID.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
  };
}
