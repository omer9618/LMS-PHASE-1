import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238 over RFC 4226 HOTP), HMAC-SHA1, 30-second steps, 6 digits: the parameters every
 * authenticator app (Google Authenticator, Authy, 1Password) uses by default. Pure: no I/O.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too, for clock drift. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random secret: 160 bits, as RFC 4226 recommends, base32-encoded for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** HOTP value for a counter, zero-padded to `digits`. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBytes).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

export function totpAt(secretBase32: string, at: Date): string {
  return hotp(base32Decode(secretBase32), timeStep(at));
}

/**
 * Returns the matched step if `code` is valid within the window and newer than `lastUsedStep`
 * (so a code can never be used twice), otherwise null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  at: Date,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(at);
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** otpauth:// URI that authenticator apps read from a QR code. */
export function otpauthUri(issuer: string, accountName: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
