import { z } from 'zod';
import { uuidParams } from '../../../common/schemas';

export const lessonContentParamsSchema = uuidParams('courseId', 'lessonId');
export type LessonContentParams = z.infer<typeof lessonContentParamsSchema>;

export const resourceParamsSchema = uuidParams('courseId', 'lessonId', 'resourceId');
export type ResourceParams = z.infer<typeof resourceParamsSchema>;

export const startVideoUploadSchema = z
  .strictObject({ title: z.string().trim().min(1).max(200).optional() })
  .default({});
export type StartVideoUploadInput = z.infer<typeof startVideoUploadSchema>;

/** Webhook routes: /webhooks/video/bunny (production) and /webhooks/video/self-hosted (fake). */
export const videoWebhookParamsSchema = z.object({
  provider: z.enum(['bunny', 'self-hosted']),
});
export type VideoWebhookParams = z.infer<typeof videoWebhookParamsSchema>;
