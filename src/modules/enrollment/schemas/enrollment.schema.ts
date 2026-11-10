import { EnrollmentStatus } from '@prisma/client';
import { z } from 'zod';
import { paging, uuidParams } from '../../../common/schemas';

export const courseIdParamsSchema = uuidParams('courseId');
export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;

export const enrollmentIdParamsSchema = uuidParams('enrollmentId');
export type EnrollmentIdParams = z.infer<typeof enrollmentIdParamsSchema>;

export const listEnrollmentsQuerySchema = z.strictObject({
  courseId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  status: z.enum(EnrollmentStatus).optional(),
  ...paging({ max: 100, default: 50 }),
});
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;

/** #49: an admin grant records the offline payment channel and the reason. */
export const adminGrantSchema = z.strictObject({
  studentEmail: z.email().max(254),
  courseId: z.uuid(),
  paymentChannel: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(3).max(1000),
  /** Optional end of access (#51); perpetual when omitted (#125 is still open). */
  expiresAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), 'Must be in the future')
    .optional(),
});
export type AdminGrantInput = z.infer<typeof adminGrantSchema>;

export const revokeEnrollmentSchema = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
});
export type RevokeEnrollmentInput = z.infer<typeof revokeEnrollmentSchema>;
