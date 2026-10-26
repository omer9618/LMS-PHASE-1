import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque tokens: session cookies and emailed links (verification, password reset).
 * 256 random bits, given to the user once. The database stores only the SHA-256 hash, so a leaked
 * table cannot be replayed. (A fast hash is correct here: the input is high-entropy, unlike a
 * password.)
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap shape check before hashing/looking up arbitrary cookie input. */
export function isWellFormedOpaqueToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
