import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Throttle, type ThrottlerOptions } from '@nestjs/throttler';

const MINUTE = 60_000;

// The metadata key @Throttle() writes (the library does not export it). rate-limit.e2e-spec.ts
// fails if it ever changes: the account and search buckets would stop applying.
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';

/**
 * Rate limits (#17). One place to read and tune them.
 *
 * - `DEFAULT` applies to every route, per client IP. The routes below replace it with
 *   `@RateLimit(name)`, except the two that use their own bucket (see `buildThrottlers`).
 * - `LOGIN` is per IP and generous on purpose: a school lab or a family on one mobile hotspot
 *   shares one address. The brake on guessing one account's password is `LOGIN_ACCOUNT`, per email.
 * - `SEARCH` counts only catalogue requests that carry a search term; plain browsing is not
 *   search and is limited by `DEFAULT`.
 *
 * Counters live in memory. The VPS runs one API container in steady state, and a deploy briefly
 * runs two, so a limit can be doubled for a minute during a deploy. If the API is ever scaled out
 * for good, give ThrottlerModule a shared storage (for example Redis) in `app.module.ts`.
 */
export const RATE_LIMITS = {
  DEFAULT: { limit: 300, ttl: MINUTE },
  LOGIN: { limit: 30, ttl: MINUTE },
  LOGIN_ACCOUNT: { limit: 10, ttl: MINUTE },
  REGISTER: { limit: 5, ttl: 60 * MINUTE },
  ACCOUNT_EMAIL: { limit: 5, ttl: 15 * MINUTE },
  PASSWORD_CHANGE: { limit: 5, ttl: 15 * MINUTE },
  APPLICATION_SUBMIT: { limit: 5, ttl: 60 * MINUTE },
  SEARCH: { limit: 60, ttl: MINUTE },
} as const;

/** Limits that replace the per-IP default on one route. */
export type RateLimitName = Exclude<
  keyof typeof RATE_LIMITS,
  'DEFAULT' | 'LOGIN_ACCOUNT' | 'SEARCH'
>;

/** Applies a named limit from RATE_LIMITS to a route or controller. */
export const RateLimit = (name: RateLimitName) => Throttle({ default: RATE_LIMITS[name] });

/** Sign-in with a password: a per-IP cap plus a strict per-email cap. */
export const LoginRateLimit = () =>
  Throttle({ default: RATE_LIMITS.LOGIN, account: RATE_LIMITS.LOGIN_ACCOUNT });

/** Catalogue search: the `search` bucket applies to requests that carry a search term. */
export const SearchRateLimit = () => Throttle({ search: RATE_LIMITS.SEARCH });

interface RequestLike {
  ip?: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

const requestOf = (context: ExecutionContext) => context.switchToHttp().getRequest<RequestLike>();

/** Whether the route (or its controller) opted in to a named throttler with its decorator. */
export function optedIn(name: string, context: ExecutionContext): boolean {
  const key = THROTTLER_LIMIT + name;
  return (
    Reflect.getMetadata(key, context.getHandler()) !== undefined ||
    Reflect.getMetadata(key, context.getClass()) !== undefined
  );
}

/** The email a sign-in attempt names, lower-cased; the account bucket counts attempts by it. */
export function accountTracker(req: RequestLike): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim()
    ? `account:${email.trim().toLowerCase().slice(0, 254)}`
    : `ip:${req.ip ?? 'unknown'}`;
}

/**
 * The throttlers. A named throttler's own `skipIf` replaces the module-wide one, so each repeats
 * the on/off switch. `account` and `search` only act on routes that opt in.
 */
export function buildThrottlers(enabled: boolean): ThrottlerOptions[] {
  return [
    { name: 'default', ...RATE_LIMITS.DEFAULT, skipIf: () => !enabled },
    {
      name: 'account',
      ...RATE_LIMITS.LOGIN_ACCOUNT,
      getTracker: accountTracker,
      skipIf: (context) => !enabled || !optedIn('account', context),
    },
    {
      name: 'search',
      ...RATE_LIMITS.SEARCH,
      skipIf: (context) => {
        const q = requestOf(context).query?.q;
        return !enabled || !optedIn('search', context) || typeof q !== 'string' || q.trim() === '';
      },
    },
  ];
}
