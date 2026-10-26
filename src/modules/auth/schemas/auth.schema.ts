import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().max(254),
  // Upper bound stops very long inputs reaching bcrypt (which truncates at 72 bytes anyway).
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
