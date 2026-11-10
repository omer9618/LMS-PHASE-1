import { z } from 'zod';
import { id, isoDateTime } from './common';

/** Auth, session and MFA responses (#10–#17). */

export const role = z.enum(['STUDENT', 'TEACHER', 'ADMIN']);
export type Role = z.infer<typeof role>;

export const user = z.object({
  id,
  email: z.string(),
  fullName: z.string().nullable(),
  isEmailVerified: z.boolean(),
  roles: z.array(role),
});
export type User = z.infer<typeof user>;

/** GET /auth/me */
export const me = user.extend({
  mfaEnabled: z.boolean(),
  mfaVerified: z.boolean(),
});
export type Me = z.infer<typeof me>;

/** POST /auth/login: signed in, or an admin's MFA challenge. */
export const loginResult = z.union([
  z.object({
    mfaRequired: z.literal(true),
    challengeToken: z.string(),
    expiresAt: isoDateTime,
  }),
  z.object({ user, mfaRequired: z.undefined().optional() }),
]);
export type LoginResult = z.infer<typeof loginResult>;

/** GET /auth/mfa */
export const mfaStatus = z.object({
  enabled: z.boolean(),
  required: z.boolean(),
  recoveryCodesRemaining: z.number().int().nonnegative(),
});
export type MfaStatus = z.infer<typeof mfaStatus>;

/** POST /auth/mfa/setup: the secret to add to an authenticator app. */
export const mfaSetup = z.object({ secret: z.string(), otpauthUri: z.string() });
export type MfaSetup = z.infer<typeof mfaSetup>;

/** POST /auth/mfa/enable and /auth/mfa/recovery-codes: shown once. */
export const recoveryCodes = z.object({ recoveryCodes: z.array(z.string()).min(1) });

/** POST /auth/verify-email/resend: false when the address is already verified. */
export const resendVerification = z.object({ sent: z.boolean() });
