import { isEnrollmentActive } from './enrollment.rules';

describe('isEnrollmentActive (#51)', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('active and perpetual, or active and not yet expired, grants access', () => {
    expect(isEnrollmentActive({ status: 'ACTIVE', expiresAt: null }, now)).toBe(true);
    expect(isEnrollmentActive({ status: 'ACTIVE', expiresAt: new Date('2026-10-27') }, now)).toBe(
      true,
    );
  });

  it('expired, revoked or past expiry does not', () => {
    expect(isEnrollmentActive({ status: 'ACTIVE', expiresAt: now }, now)).toBe(false);
    expect(isEnrollmentActive({ status: 'REVOKED', expiresAt: null }, now)).toBe(false);
    expect(isEnrollmentActive({ status: 'EXPIRED', expiresAt: null }, now)).toBe(false);
  });
});
