import { assertAcceptablePassword, WeakPasswordError } from './password.rules';

describe('password policy', () => {
  const email = 'ayesha.khan@example.com';

  it('accepts a long passphrase without composition rules', () => {
    expect(() => assertAcceptablePassword('correct horse battery staple', email)).not.toThrow();
  });

  it.each([
    ['too short', 'short1!'],
    ['the email itself', 'ayesha.khan@example.com'],
    ['contains the email local part', 'my-ayesha.khan-password'],
    ['too repetitive', 'aaaaaaaaaaaa'],
    ['too long', 'x'.repeat(129) + 'abcd'],
  ])('rejects a password that is %s', (_label, password) => {
    expect(() => assertAcceptablePassword(password, email)).toThrow(WeakPasswordError);
  });
});
