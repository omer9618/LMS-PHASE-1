import { z } from 'zod';

const courseId = z.uuid();

/** #54: cart preview body. Up to 20 courses per cart. */
export const cartPreviewSchema = z.strictObject({
  courseIds: z.array(courseId).min(1).max(20),
});
export type CartPreviewInput = z.infer<typeof cartPreviewSchema>;
