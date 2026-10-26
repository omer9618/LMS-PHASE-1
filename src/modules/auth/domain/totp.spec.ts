import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  timeStep,
  totpAt,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B (SHA-1) and RFC 4226 Appendix D use this 20-byte ASCII key.
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET = base32Encode(RFC_KEY);

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314'];
    expected.forEach((code, counter) => expect(hotp(RFC_KEY, counter)).toBe(code));
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC 6238 vector at T=%i (8 digits)', (seconds, code) => {
    expect(hotp(RFC_KEY, Math.floor(seconds / 30), 8)).toBe(code);
  });

  it('round-trips base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').toString()).toBe(
      '12345678901234567890',
    );
  });

  describe('verifyTotp', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const step = timeStep(now);
    const codeAt = (offsetSteps: number) =>
      totpAt(RFC_SECRET, new Date(now.getTime() + offsetSteps * 30_000));

    it('accepts the current code and one step either side (clock drift)', () => {
      expect(verifyTotp(RFC_SECRET, codeAt(0), now, null)).toBe(step);
      expect(verifyTotp(RFC_SECRET, codeAt(-1), now, null)).toBe(step - 1);
      expect(verifyTotp(RFC_SECRET, codeAt(1), now, null)).toBe(step + 1);
    });

    it('rejects codes outside the window and malformed input', () => {
      expect(verifyTotp(RFC_SECRET, codeAt(-2), now, null)).toBeNull();
      expect(verifyTotp(RFC_SECRET, codeAt(2), now, null)).toBeNull();
      expect(verifyTotp(RFC_SECRET, '12345', now, null)).toBeNull();
      expect(verifyTotp(RFC_SECRET, 'abcdef', now, null)).toBeNull();
    });

    it('never accepts a step at or before the last used one (no replay)', () => {
      expect(verifyTotp(RFC_SECRET, codeAt(0), now, step)).toBeNull();
      expect(verifyTotp(RFC_SECRET, codeAt(-1), now, step - 1)).toBeNull();
      expect(verifyTotp(RFC_SECRET, codeAt(1), now, step)).toBe(step + 1);
    });
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = otpauthUri('LMS', 'admin@lms.local', RFC_SECRET);
    expect(uri.startsWith('otpauth://totp/LMS%3Aadmin%40lms.local?')).toBe(true);
    expect(new URL(uri).searchParams.get('secret')).toBe(RFC_SECRET);
    expect(new URL(uri).searchParams.get('digits')).toBe('6');
  });
});
