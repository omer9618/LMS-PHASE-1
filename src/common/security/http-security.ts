import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ERROR_DEFINITIONS, ErrorCode } from '../errors/error-codes';

/**
 * HTTP hardening for a JSON API (#119, docs/SECURITY_REVIEW.md). No dependency: the API serves no
 * HTML, so a small fixed header set is enough and easier to audit than a configurable library.
 */

/** Origins trusted for browser calls: the web app, this API, and any extra configured origins. */
export function trustedOrigins(env: {
  APP_PUBLIC_URL: string;
  API_PUBLIC_URL: string;
  CORS_ORIGINS: string[];
}): string[] {
  const origins = [env.APP_PUBLIC_URL, env.API_PUBLIC_URL, ...env.CORS_ORIGINS].map(
    (url) => new URL(url).origin,
  );
  return [...new Set(origins)];
}

/**
 * Security headers on every response:
 * - nosniff, no framing, no referrer, a CSP that allows nothing (JSON is never rendered);
 * - cross-origin isolation of the window and of resources (same-site);
 * - HSTS when cookies are Secure (i.e. served over HTTPS);
 * - `Cache-Control: no-store` unless a handler set its own, so personal data is not cached by
 *   shared proxies or the browser's back/forward cache.
 */
export function securityHeaders(options: { hsts: boolean }): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (options.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth. The session cookie is SameSite=Lax (Strict optional), which already keeps
 * it off cross-site POSTs. On top of that, a state-changing request that carries an `Origin`
 * header must come from a trusted origin. Requests without `Origin` (server-to-server: provider
 * webhooks, curl, the Next.js server) are unaffected; browsers always send it on cross-origin
 * writes.
 */
export function originCheck(allowed: readonly string[]): RequestHandler {
  const trusted = new Set(allowed);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || origin === undefined || trusted.has(origin)) {
      next();
      return;
    }
    const { status, message } = ERROR_DEFINITIONS[ErrorCode.FORBIDDEN];
    res.status(status).json({
      success: false,
      error: {
        name: ErrorCode.FORBIDDEN,
        message,
        info: { reason: 'ORIGIN_NOT_ALLOWED' },
      },
    });
  };
}
