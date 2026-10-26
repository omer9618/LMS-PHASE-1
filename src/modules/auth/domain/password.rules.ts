import { DomainError } from '../../../common/errors/domain.error';

/**
 * Password policy (pure). Length is what matters most (NIST SP 800-63B): at least 10 characters,
 * no composition rules, and not trivially derived from the email address.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export class WeakPasswordError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export function assertAcceptablePassword(password: string, email: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new WeakPasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, {
      field: 'password',
    });
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new WeakPasswordError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`, {
      field: 'password',
    });
  }
  const normalised = password.toLowerCase();
  const localPart = email.split('@')[0].toLowerCase();
  if (
    normalised === email.toLowerCase() ||
    (localPart.length >= 4 && normalised.includes(localPart))
  ) {
    throw new WeakPasswordError('Password must not contain your email address', {
      field: 'password',
    });
  }
  if (new Set(password).size < 4) {
    throw new WeakPasswordError('Password is too repetitive', { field: 'password' });
  }
}

/** Lifetimes of emailed tokens. */
export const TOKEN_TTL = {
  EMAIL_VERIFICATION_HOURS: 48,
  PASSWORD_RESET_MINUTES: 30,
  /** New accounts created by an admin: long enough to survive a weekend. */
  ACCOUNT_SETUP_HOURS: 72,
} as const;
