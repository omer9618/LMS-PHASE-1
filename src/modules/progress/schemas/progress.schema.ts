import { z } from 'zod';
import { paging, uuidParams } from '../../../common/schemas';

export const courseParamsSchema = uuidParams('courseId');
export type CourseParams = z.infer<typeof courseParamsSchema>;

export const lessonParamsSchema = uuidParams('courseId', 'lessonId');
export type LessonParams = z.infer<typeof lessonParamsSchema>;

export const studentProgressParamsSchema = uuidParams('courseId', 'studentId');
export type StudentProgressParams = z.infer<typeof studentProgressParamsSchema>;

/** #91: the player's current position. Bounded at 24 h; clamped to the video duration. */
export const watchPositionSchema = z.strictObject({
  positionSeconds: z.number().min(0).max(86_400),
});
export type WatchPositionInput = z.infer<typeof watchPositionSchema>;

export const rosterQuerySchema = z.object({
  ...paging({ max: 100, default: 50 }),
});
export type RosterQuery = z.infer<typeof rosterQuerySchema>;
