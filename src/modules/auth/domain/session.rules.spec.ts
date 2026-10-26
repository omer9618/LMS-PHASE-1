import { rejectSession, sessionExpiry, SessionState, shouldTouch } from './session.rules';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-22T12:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

const live: SessionState = {
  expiresAt: at(HOUR),
  lastSeenAt: at(-1000),
  revokedAt: null,
  userStatus: 'ACTIVE',
};
const policy = { idleTimeoutMs: 2 * HOUR };

describe('rejectSession', () => {
  it('accepts a live session', () => {
    expect(rejectSession(live, now, policy)).toBeNull();
  });

  it('rejects a revoked session even if not expired', () => {
    expect(rejectSession({ ...live, revokedAt: at(-1) }, now, policy)).toBe('REVOKED');
  });

  it('rejects at and after the absolute expiry', () => {
    expect(rejectSession({ ...live, expiresAt: now }, now, policy)).toBe('EXPIRED');
    expect(rejectSession({ ...live, expiresAt: at(-1) }, now, policy)).toBe('EXPIRED');
  });

  it('rejects an idle session', () => {
    expect(rejectSession({ ...live, lastSeenAt: at(-2 * HOUR) }, now, policy)).toBe('IDLE');
    expect(rejectSession({ ...live, lastSeenAt: at(-2 * HOUR + 1) }, now, policy)).toBeNull();
  });

  it('rejects sessions of suspended or deleted users', () => {
    expect(rejectSession({ ...live, userStatus: 'SUSPENDED' }, now, policy)).toBe('USER_INACTIVE');
    expect(rejectSession({ ...live, userStatus: 'DELETED' }, now, policy)).toBe('USER_INACTIVE');
  });
});

describe('sessionExpiry / shouldTouch', () => {
  it('expires ttl after now', () => {
    expect(sessionExpiry(now, { ttlMs: HOUR })).toEqual(at(HOUR));
  });

  it('touches only once the interval has passed', () => {
    const p = { touchIntervalMs: 5 * 60 * 1000 };
    expect(shouldTouch(at(-60 * 1000), now, p)).toBe(false);
    expect(shouldTouch(at(-5 * 60 * 1000), now, p)).toBe(true);
  });
});
