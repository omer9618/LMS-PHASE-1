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

export const contextRole = z.enum(['ADMIN', 'TEACHER']);
export type ContextRole = z.infer<typeof contextRole>;

/** GET /auth/me and POST /auth/context. */
export const me = user.extend({
  mfaEnabled: z.boolean(),
  mfaVerified: z.boolean(),
  /** Which role a dual-role (Admin + Teacher) account is working as (#109). */
  activeContext: contextRole.nullable().optional(),
  availableContexts: z.array(contextRole).optional(),
});
export type Me = z.infer<typeof me>;

/** GET /auth/session: the signed-in user, or null for a visitor (always 200). */
export const session = z.object({ user: me.nullable() });
export type SessionResponse = z.infer<typeof session>;

/** One device the account is signed in on (GET /account/sessions). */
export const accountSession = z.object({
  id,
  createdAt: isoDateTime,
  lastSeenAt: isoDateTime,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** The device making this request. */
  current: z.boolean(),
});
export type AccountSession = z.infer<typeof accountSession>;

export const accountSessions = z.array(accountSession);

/** POST /account/password */
export const passwordChanged = z.object({
  changed: z.literal(true),
  otherSessionsEnded: z.number().int().nonnegative(),
});

/** POST /account/sessions/sign-out-others */
export const signedOutOthers = z.object({ ended: z.number().int().nonnegative() });

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

/** POST /teacher-applications */
export const submittedApplication = z.object({
  id,
  status: z.string(),
  submittedAt: isoDateTime,
});
export type SubmittedApplication = z.infer<typeof submittedApplication>;
