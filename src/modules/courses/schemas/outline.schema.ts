import { LessonType } from '@prisma/client';
import { z } from 'zod';

export const courseSectionParamsSchema = z.object({ courseId: z.uuid(), sectionId: z.uuid() });
export type CourseSectionParams = z.infer<typeof courseSectionParamsSchema>;

export const courseLessonParamsSchema = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
export type CourseLessonParams = z.infer<typeof courseLessonParamsSchema>;

export const sectionSchema = z.strictObject({ title: z.string().trim().min(1).max(200) });
export type SectionInput = z.infer<typeof sectionSchema>;

export const sectionOrderSchema = z.strictObject({ sectionIds: z.array(z.uuid()).max(200) });
export type SectionOrderInput = z.infer<typeof sectionOrderSchema>;

export const lessonOrderSchema = z.strictObject({ lessonIds: z.array(z.uuid()).max(500) });
export type LessonOrderInput = z.infer<typeof lessonOrderSchema>;

export const createLessonSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  type: z.enum(LessonType),
  bodyText: z.string().max(100_000).optional(),
  isFreePreview: z.boolean().optional(),
});
export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    bodyText: z.string().max(100_000).optional(),
    isFreePreview: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

export const moveLessonSchema = z.strictObject({
  sectionId: z.uuid(),
  position: z.int().min(0).max(500),
});
export type MoveLessonInput = z.infer<typeof moveLessonSchema>;
