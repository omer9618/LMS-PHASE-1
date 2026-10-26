import { ApplicationStatus } from '@prisma/client';
import { z } from 'zod';

/** Multipart text fields of the public application form (#18). The CV is the `cv` file part. */
export const submitApplicationSchema = z.strictObject({
  applicantName: z.string().trim().min(2).max(120),
  applicantEmail: z.email().max(254),
  applicantPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Must be a phone number')
    .optional(),
  subjects: z.string().trim().min(2).max(500).optional(),
  captchaToken: z.string().min(1).max(4096),
});
export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

export const applicationIdParamsSchema = z.object({ applicationId: z.uuid() });
export type ApplicationIdParams = z.infer<typeof applicationIdParamsSchema>;

export const listApplicationsQuerySchema = z.object({
  status: z.enum(ApplicationStatus).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;

export const reviewApplicationSchema = z.strictObject({
  status: z.enum([
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.REJECTED,
    ApplicationStatus.HIRED,
  ]),
  notes: z.string().trim().max(2000).optional(),
});
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

export const createTeacherFromApplicationSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(120).optional(),
});
export type CreateTeacherFromApplicationInput = z.infer<typeof createTeacherFromApplicationSchema>;

export const linkApplicationSchema = z.strictObject({ userId: z.uuid() });
export type LinkApplicationInput = z.infer<typeof linkApplicationSchema>;

export const teacherIdParamsSchema = z.object({ teacherId: z.uuid() });
export type TeacherIdParams = z.infer<typeof teacherIdParamsSchema>;

export const deactivateTeacherSchema = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
});
export type DeactivateTeacherInput = z.infer<typeof deactivateTeacherSchema>;
