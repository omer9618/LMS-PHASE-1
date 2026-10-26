import { createHash, randomBytes } from 'node:crypto';

/**
 * Session tokens are 256 random bits, sent only in the HTTP-only cookie.
 * The database stores the SHA-256 hash, so a leaked sessions table cannot be replayed.
 * (A fast hash is correct here: the input is high-entropy, unlike a password.)
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap shape check before hashing/looking up arbitrary cookie input. */
export function isWellFormedSessionToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
