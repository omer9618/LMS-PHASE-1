/**
 * Pure session rules (#12). No Nest, Prisma or I/O: unit-tested directly.
 */

export interface SessionPolicy {
  /** Absolute lifetime from login. */
  ttlMs: number;
  /** A session unused for this long is dead even before its absolute expiry. */
  idleTimeoutMs: number;
  /** last_seen_at is written at most this often per session, to keep reads cheap. */
  touchIntervalMs: number;
}

export interface SessionState {
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

export type SessionRejection = 'REVOKED' | 'EXPIRED' | 'IDLE' | 'USER_INACTIVE';

export const DEFAULT_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionExpiry(now: Date, policy: Pick<SessionPolicy, 'ttlMs'>): Date {
  return new Date(now.getTime() + policy.ttlMs);
}

/** Why a session cannot be used, or null if it can. */
export function rejectSession(
  session: SessionState,
  now: Date,
  policy: Pick<SessionPolicy, 'idleTimeoutMs'>,
): SessionRejection | null {
  if (session.revokedAt) return 'REVOKED';
  if (session.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (now.getTime() - session.lastSeenAt.getTime() >= policy.idleTimeoutMs) return 'IDLE';
  if (session.userStatus !== 'ACTIVE') return 'USER_INACTIVE';
  return null;
}

export function shouldTouch(
  lastSeenAt: Date,
  now: Date,
  policy: Pick<SessionPolicy, 'touchIntervalMs'>,
): boolean {
  return now.getTime() - lastSeenAt.getTime() >= policy.touchIntervalMs;
}
