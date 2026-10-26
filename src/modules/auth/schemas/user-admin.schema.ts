import { Role, UserStatus } from '@prisma/client';
import { z } from 'zod';

export const userIdParamsSchema = z.object({ userId: z.uuid() });
export type UserIdParams = z.infer<typeof userIdParamsSchema>;

export const userRoleParamsSchema = z.object({ userId: z.uuid(), role: z.enum(Role) });
export type UserRoleParams = z.infer<typeof userRoleParamsSchema>;

export const listUsersQuerySchema = z.object({
  role: z.enum(Role).optional(),
  status: z.enum(UserStatus).optional(),
  /** Matches name or email. */
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Admins create staff accounts; students register themselves (#11). */
export const createAccountSchema = z.strictObject({
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(120),
  roles: z
    .array(z.enum([Role.ADMIN, Role.TEACHER]))
    .min(1)
    .refine((roles) => new Set(roles).size === roles.length, 'Roles must not repeat'),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const reasonSchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const grantRoleSchema = z.strictObject({ role: z.enum(Role) });
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;
