import { randomBytes } from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  normaliseRecoveryCode,
  parseMfaKey,
} from './mfa-crypto';

describe('MFA crypto', () => {
  const key = randomBytes(32);

  it('encrypts secrets with a fresh IV and decrypts them back', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses a tampered ciphertext or the wrong key', () => {
    const stored = encryptSecret('secret', key);
    const bytes = Buffer.from(stored.slice(3), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptSecret(`v1:${bytes.toString('base64')}`, key)).toThrow();
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
  });

  it('generates distinct, readable recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) =>
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$/),
    );
  });

  it('hashes recovery codes with a key, ignoring case and dashes', () => {
    expect(hashRecoveryCode('abcd-efgh-jk', key)).toBe(hashRecoveryCode('ABCDEFGHJK', key));
    expect(hashRecoveryCode('ABCDEFGHJK', key)).not.toBe(
      hashRecoveryCode('ABCDEFGHJK', randomBytes(32)),
    );
    expect(normaliseRecoveryCode(' ab-cd ')).toBe('ABCD');
  });

  it('validates the key length', () => {
    expect(() => parseMfaKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseMfaKey(Buffer.alloc(32).toString('base64'))).toHaveLength(32);
  });
});
