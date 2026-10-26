import { z } from 'zod';

const totpCode = z
  .string()
  .regex(/^\d{6}$/, 'Must be the 6-digit code from your authenticator app');

export const mfaCodeSchema = z.strictObject({ code: totpCode });
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

/** Exactly one of a TOTP code or a recovery code. */
export const mfaLoginSchema = z
  .strictObject({
    challengeToken: z.string().min(1).max(100),
    code: totpCode.optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), {
    message: 'Provide either code or recoveryCode',
    path: ['code'],
  });
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;
