import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  actorUserId: z.uuid().optional(),
  actorEmail: z.string().trim().min(1).max(254).optional(),
  action: z
    .string()
    .regex(/^[A-Z][A-Z_]*$/)
    .optional(),
  entityType: z
    .string()
    .regex(/^[a-z][a-z_]*$/)
    .optional(),
  entityId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
