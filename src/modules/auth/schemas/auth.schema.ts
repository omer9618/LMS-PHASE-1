import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../domain/password.rules';

const email = z.email().max(254);
// Strength rules live in domain/password.rules.ts; this only bounds the input size.
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const token = z.string().min(1).max(100);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Must be a phone number');

export const loginSchema = z.object({ email, password });
export type LoginInput = z.infer<typeof loginSchema>;

/** #11. Guardian details are optional (decided 2026-10-26). */
export const registerSchema = z.strictObject({
  email,
  password,
  fullName: z.string().trim().min(2).max(120),
  guardianName: z.string().trim().min(2).max(120).optional(),
  guardianEmail: email.optional(),
  guardianPhone: phone.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.strictObject({ token });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const requestPasswordResetSchema = z.strictObject({ email });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.strictObject({ token, password });
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
