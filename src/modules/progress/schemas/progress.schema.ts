import { z } from 'zod';

export const courseParamsSchema = z.object({ courseId: z.uuid() });
export type CourseParams = z.infer<typeof courseParamsSchema>;

export const lessonParamsSchema = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
export type LessonParams = z.infer<typeof lessonParamsSchema>;

export const studentProgressParamsSchema = z.object({ courseId: z.uuid(), studentId: z.uuid() });
export type StudentProgressParams = z.infer<typeof studentProgressParamsSchema>;

/** #91: the player's current position. Bounded at 24 h; clamped to the video duration. */
export const watchPositionSchema = z.strictObject({
  positionSeconds: z.number().min(0).max(86_400),
});
export type WatchPositionInput = z.infer<typeof watchPositionSchema>;

export const rosterQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RosterQuery = z.infer<typeof rosterQuerySchema>;
