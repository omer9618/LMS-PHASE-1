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
  /**
   * Roles in effect for this request. Equal to `heldRoles`, except for accounts holding both
   * ADMIN and TEACHER (#109): those work in one context at a time, and the other role is left out.
   * Route guards, scopes and services check this set, so a context is never crossed silently.
   */
  readonly roles: ReadonlySet<Role>;
  /** Every role the account holds (`user_roles`). Use for account-level rules such as MFA. */
  readonly heldRoles: ReadonlySet<Role>;
  /** #109: the session's active context for ADMIN+TEACHER accounts; null for everyone else. */
  readonly activeContext: 'ADMIN' | 'TEACHER' | null;
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
