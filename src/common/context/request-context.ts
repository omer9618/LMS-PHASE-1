import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request values that cross-cutting services need without receiving the Request
 * (services never see Request/Response). Populated by `requestContextMiddleware`.
 */
export interface RequestContextValues {
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContextValues>();

export const RequestContext = {
  /** The current request's values, or an empty object outside a request (jobs, scripts). */
  get(): RequestContextValues {
    return storage.getStore() ?? {};
  },

  /** Runs `fn` with the given values; used by background jobs and tests. */
  run<T>(values: RequestContextValues, fn: () => T): T {
    return storage.run(values, fn);
  },
};

const MAX_USER_AGENT_LENGTH = 512;

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run(
    { ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH) },
    next,
  );
}
