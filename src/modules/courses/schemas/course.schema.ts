import { CourseStatus } from '@prisma/client';
import { z } from 'zod';
import { MAX_COMMISSION_BPS } from '../domain/course.rules';

/** Money arrives as a string of minor units ("150000") and becomes a bigint. Never a float. */
const moneyMinor = z
  .string()
  .regex(/^\d{1,18}$/, 'Must be a whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

const commissionBps = z.int().min(0).max(MAX_COMMISSION_BPS);

const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

export const courseIdParamsSchema = z.object({ courseId: z.uuid() });
export type CourseIdParams = z.infer<typeof courseIdParamsSchema>;

/** #24. syllabusArea is free text: no syllabus hierarchy until #126 is answered. */
export const createCourseSchema = z.strictObject({
  boardId: z.uuid(),
  levelId: z.uuid(),
  subjectId: z.uuid(),
  syllabusArea: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

/** #25 submit; teacherProposedBps is #30's advisory proposal, stored as-is. */
export const submitCourseSchema = z
  .strictObject({ teacherProposedBps: commissionBps.optional() })
  .default({});
export type SubmitCourseInput = z.infer<typeof submitCourseSchema>;

/** #28. The reason is written to audit_log; the courses table has no reason column. */
export const rejectCourseSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});
export type RejectCourseInput = z.infer<typeof rejectCourseSchema>;

/** #29. Either free, or price + currency + commission together. */
export const setPricingSchema = z.discriminatedUnion('isFree', [
  z.strictObject({ isFree: z.literal(true) }),
  z.strictObject({
    isFree: z.literal(false),
    priceMinor: moneyMinor,
    currency: z.string().regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 code'),
    commissionRateBps: commissionBps,
  }),
]);
export type SetPricingInput = z.infer<typeof setPricingSchema>;

export const listMyCoursesQuerySchema = z.object({
  status: z.enum(CourseStatus).optional(),
  ...pagination,
});
export type ListMyCoursesQuery = z.infer<typeof listMyCoursesQuerySchema>;

/** #28 review queue: defaults to courses awaiting approval, oldest first. */
export const listCoursesForReviewQuerySchema = z.object({
  status: z.enum(CourseStatus).default(CourseStatus.PENDING_APPROVAL),
  ...pagination,
});
export type ListCoursesForReviewQuery = z.infer<typeof listCoursesForReviewQuerySchema>;
