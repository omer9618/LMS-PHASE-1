import { redact } from './redact';

describe('redact', () => {
  it('replaces sensitive keys at any depth and leaves the rest', () => {
    expect(
      redact({
        email: 'a@b.c',
        password: 'hunter2',
        nested: { resetToken: 't', clientSecret: 's', keep: 1 },
        list: [{ newPassword: 'p' }],
      }),
    ).toEqual({
      email: 'a@b.c',
      password: '[Redacted]',
      nested: { resetToken: '[Redacted]', clientSecret: '[Redacted]', keep: 1 },
      list: [{ newPassword: '[Redacted]' }],
    });
  });

  it('redacts one-time codes but not ordinary fields that contain "code" (#119)', () => {
    expect(
      redact({ code: '123456', recoveryCode: 'abcd-efgh', countryCode: 'PK', otp: '1' }),
    ).toEqual({
      code: '[Redacted]',
      recoveryCode: '[Redacted]',
      countryCode: 'PK',
      otp: '[Redacted]',
    });
  });

  it('passes primitives and undefined through', () => {
    expect(redact(undefined)).toBeUndefined();
    expect(redact('x')).toBe('x');
  });
});
