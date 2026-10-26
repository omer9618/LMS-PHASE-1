import type { Role } from '@prisma/client';

/**
 * The authenticated caller, attached to the request by AuthGuard.
 * Roles are the user's `user_roles` rows as a set: one user can be ADMIN and TEACHER (#10).
 */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly isEmailVerified: boolean;
  readonly roles: ReadonlySet<Role>;
  readonly sessionId: string;
  /** The account has TOTP enrolled (#16). */
  readonly mfaEnabled: boolean;
  /** This session passed MFA. Required for any account holding ADMIN. */
  readonly mfaVerified: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
