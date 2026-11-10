import { z } from 'zod';
import { paging } from '../../../common/schemas';

export const auditLogQuerySchema = z.strictObject({
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
  ...paging({ max: 200, default: 50 }),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
