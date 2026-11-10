import { z } from 'zod';
import { email, fullName, newPassword, optionalEmail, optionalName, optionalText } from './fields';

/** Account forms: sign in, MFA code, registration, password reset. */

export const loginForm = z.object({
  email: z.string().trim().min(1, 'Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
});

/** The second sign-in step: a 6-digit authenticator code, or a recovery code. */
export const mfaCodeForm = (useRecovery: boolean) =>
  z.object({
    code: useRecovery
      ? z.string().trim().min(10, 'Enter one of your recovery codes')
      : z
          .string()
          .trim()
          .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
  });

/** Student registration (#11). Guardian details are optional. */
export const registrationForm = z
  .object({
    fullName,
    email,
    password: newPassword,
    guardianName: optionalName('Enter the guardian’s full name, or leave it empty'),
    guardianEmail: optionalEmail,
    guardianPhone: optionalText,
  })
  .transform((v) => {
    // The API rejects empty optional fields, so they are left out of the body entirely.
    const body: Record<string, string> = {
      fullName: v.fullName,
      email: v.email,
      password: v.password,
    };
    for (const key of ['guardianName', 'guardianEmail', 'guardianPhone'] as const) {
      const value = v[key];
      if (value) body[key] = value;
    }
    return body;
  });

export const forgotPasswordForm = z.object({ email });

export const resetPasswordForm = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.confirm === v.password, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });
