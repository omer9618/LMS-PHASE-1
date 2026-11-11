import type { ExecutionContext } from '@nestjs/common';
import { accountTracker, buildThrottlers, RATE_LIMITS } from './rate-limits';

describe('accountTracker', () => {
  it('keys sign-in attempts by the lower-cased email, not the IP', () => {
    expect(accountTracker({ ip: '10.0.0.1', body: { email: '  Ada@Example.COM ' } })).toBe(
      'account:ada@example.com',
    );
  });

  it('falls back to the IP when there is no usable email', () => {
    expect(accountTracker({ ip: '10.0.0.1', body: {} })).toBe('ip:10.0.0.1');
    expect(accountTracker({ ip: '10.0.0.1', body: { email: 42 } })).toBe('ip:10.0.0.1');
    expect(accountTracker({ body: undefined })).toBe('ip:unknown');
  });
});

describe('buildThrottlers', () => {
  const context = (query: Record<string, unknown>, optIn: string[]) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ query }) }),
      getHandler: () => ({ optIn }),
      getClass: () => class Unused {},
    }) as unknown as ExecutionContext;

  it('defines the default, account and search buckets from RATE_LIMITS', () => {
    const throttlers = buildThrottlers(true);
    expect(throttlers.map((t) => t.name)).toEqual(['default', 'account', 'search']);
    expect(throttlers[0]).toMatchObject(RATE_LIMITS.DEFAULT);
    expect(throttlers[1]).toMatchObject(RATE_LIMITS.LOGIN_ACCOUNT);
    expect(throttlers[2]).toMatchObject(RATE_LIMITS.SEARCH);
  });

  it('skips every bucket when limiting is switched off', () => {
    for (const t of buildThrottlers(false)) expect(t.skipIf?.(context({ q: 'x' }, []))).toBe(true);
  });

  it('skips the account and search buckets on routes that did not opt in', () => {
    const [, account, search] = buildThrottlers(true);
    expect(account.skipIf?.(context({}, []))).toBe(true);
    expect(search.skipIf?.(context({ q: 'physics' }, []))).toBe(true);
  });
});
