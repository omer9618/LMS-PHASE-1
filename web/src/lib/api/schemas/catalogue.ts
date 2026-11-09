import { z } from 'zod';
import { currencyCode, id, isoDateTime, minorUnits, namedRef, openEnum, personRef } from './common';

/** Public catalogue, course detail and reference data (#24, #40–#44). */

export const board = namedRef.extend({ code: z.string() });
export type Board = z.infer<typeof board>;

export const level = namedRef.extend({ boardId: id, orderIndex: z.number().int() });
export type Level = z.infer<typeof level>;

export const catalogueSubject = namedRef.extend({ courseCount: z.number().int().nonnegative() });
export type CatalogueSubject = z.infer<typeof catalogueSubject>;

export const pacing = z.enum(['FREE', 'SEQUENTIAL']);
export type Pacing = z.infer<typeof pacing>;

export const lessonType = openEnum(['VIDEO', 'PDF', 'TEXT', 'QUIZ']);
export type LessonType = z.infer<typeof lessonType>;

export const courseCard = z.object({
  id,
  title: z.string(),
  description: z.string().nullable(),
  syllabusArea: z.string().nullable(),
  isFree: z.boolean(),
  /** Null for free courses. */
  priceMinor: minorUnits.nullable(),
  currency: currencyCode.nullable(),
  progressionMode: pacing,
  isEnrollmentOpen: z.boolean(),
  publishedAt: isoDateTime.nullable(),
  board: namedRef,
  level: namedRef,
  subject: namedRef,
  teacher: personRef,
});
export type CourseCard = z.infer<typeof courseCard>;

/** GET /catalogue/courses */
export const catalogueListing = z.object({
  items: z.array(courseCard),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  /** #44: the criterion behind the order, shown with the results. */
  ordering: z.string(),
});
export type CatalogueListing = z.infer<typeof catalogueListing>;

export const outlineLesson = z.object({
  id,
  title: z.string(),
  type: lessonType,
  isFreePreview: z.boolean(),
  durationSeconds: z.number().nonnegative().nullable(),
});
export type OutlineLesson = z.infer<typeof outlineLesson>;

/** GET /catalogue/courses/:courseId */
export const courseDetail = courseCard.extend({
  teacher: personRef.extend({
    profile: z
      .object({
        bio: z.string().nullable(),
        photoUrl: z.string().nullable(),
        qualifications: z.string().nullable(),
      })
      .nullable(),
  }),
  outline: z.array(z.object({ id, title: z.string(), lessons: z.array(outlineLesson) })),
  demoLessonIds: z.array(id),
  lessonCount: z.number().int().nonnegative(),
  totalVideoSeconds: z.number().nonnegative(),
});
export type CourseDetail = z.infer<typeof courseDetail>;

/** GET /courses/:courseId/lessons/:lessonId/playback */
export const playback = z.object({
  embedUrl: z.string(),
  expiresAt: isoDateTime,
  durationSeconds: z.number().nonnegative().nullable(),
});
export type Playback = z.infer<typeof playback>;
