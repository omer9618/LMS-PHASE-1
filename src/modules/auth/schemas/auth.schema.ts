import { z } from 'zod';
import { displayText, uuidParams } from '../../../common/schemas';
import { PASSWORD_MAX_LENGTH } from '../domain/password.rules';

const email = z.email().max(254);
// Strength rules live in domain/password.rules.ts; this only bounds the input size.
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const token = z.string().min(1).max(100);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Must be a phone number');

export const loginSchema = z.strictObject({ email, password });
export type LoginInput = z.infer<typeof loginSchema>;

/** #11. Guardian details are optional (decided 2026-10-26). */
export const registerSchema = z.strictObject({
  email,
  password,
  fullName: displayText(2, 120),
  guardianName: displayText(2, 120).optional(),
  guardianEmail: email.optional(),
  guardianPhone: phone.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Signed in: the current password proves it is still the owner at the keyboard. */
export const changePasswordSchema = z.strictObject({
  currentPassword: password,
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateAccountSchema = z.strictObject({ fullName: displayText(2, 120) });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const sessionIdParamsSchema = uuidParams('sessionId');
export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>;

export const verifyEmailSchema = z.strictObject({ token });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const requestPasswordResetSchema = z.strictObject({ email });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.strictObject({ token, password });
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;

/** #109: the explicit switch between the Admin and Teacher contexts of a dual-role account. */
export const switchContextSchema = z.strictObject({ role: z.enum(['ADMIN', 'TEACHER']) });
export type SwitchContextInput = z.infer<typeof switchContextSchema>;
