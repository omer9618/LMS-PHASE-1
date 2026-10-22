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

  it('passes primitives and undefined through', () => {
    expect(redact(undefined)).toBeUndefined();
    expect(redact('x')).toBe('x');
  });
});
