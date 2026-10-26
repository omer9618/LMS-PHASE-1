import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;

/**
 * Rate limits (#17), per client IP. One place to read and tune them. `DEFAULT` applies to every
 * route; the others replace it on the routes that use `@RateLimit(name)`.
 */
export const RATE_LIMITS = {
  DEFAULT: { limit: 300, ttl: MINUTE },
  LOGIN: { limit: 10, ttl: MINUTE },
  REGISTER: { limit: 5, ttl: 60 * MINUTE },
  ACCOUNT_EMAIL: { limit: 5, ttl: 15 * MINUTE },
  APPLICATION_SUBMIT: { limit: 5, ttl: 60 * MINUTE },
  SEARCH: { limit: 60, ttl: MINUTE },
} as const;

export type RateLimitName = Exclude<keyof typeof RATE_LIMITS, 'DEFAULT'>;

/** Applies a named limit from RATE_LIMITS to a route or controller. */
export const RateLimit = (name: RateLimitName) => Throttle({ default: RATE_LIMITS[name] });
