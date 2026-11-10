import { z } from 'zod';
import { id, isoDateTime, namedRef, personRef } from './common';

/** Enrollment as the student sees it (#46–#52). */

export const accessState = z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'NONE']);
export type AccessState = z.infer<typeof accessState>;

export const enrollmentStatus = z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']);
export type EnrollmentStatus = z.infer<typeof enrollmentStatus>;

export const enrollmentSource = z.enum(['PURCHASE', 'FREE', 'ADMIN_GRANT']);
export type EnrollmentSource = z.infer<typeof enrollmentSource>;

export const courseStatus = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
]);
export type CourseStatus = z.infer<typeof courseStatus>;

/** One row of GET /me/enrollments (#52). */
export const dashboardEntry = z.object({
  id,
  status: enrollmentStatus.optional(),
  source: enrollmentSource.optional(),
  grantedAt: isoDateTime.optional(),
  expiresAt: isoDateTime.nullable().optional(),
  access: accessState,
  completionPercent: z.number().min(0).max(100).optional(),
  completedLessons: z.number().int().nonnegative().optional(),
  totalLessons: z.number().int().nonnegative().optional(),
  course: z.object({
    id,
    title: z.string(),
    status: courseStatus.optional(),
    subject: namedRef.optional(),
    teacher: personRef.optional(),
  }),
});
export type DashboardEntry = z.infer<typeof dashboardEntry>;

/** GET /me/enrollments */
export const dashboard = z.array(dashboardEntry);
