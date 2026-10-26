import { z } from 'zod';

export const settingKeyParamsSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
});
export type SettingKeyParams = z.infer<typeof settingKeyParamsSchema>;

/** The per-key type check happens in the domain rules, which know each setting's schema. */
export const updateSettingSchema = z.strictObject({
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
