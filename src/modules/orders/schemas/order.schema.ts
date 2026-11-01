import { z } from 'zod';

const courseId = z.uuid();

export const orderParamsSchema = z.strictObject({
  orderId: z.uuid(),
});
export type OrderParams = z.infer<typeof orderParamsSchema>;

/** #54: cart preview body. Up to 20 courses per cart. */
export const cartPreviewSchema = z.strictObject({
  courseIds: z.array(courseId).min(1).max(20),
});
export type CartPreviewInput = z.infer<typeof cartPreviewSchema>;

/** #55: order creation body. Same shape as cart preview. */
export const createOrderSchema = z.strictObject({
  courseIds: z.array(courseId).min(1).max(20),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
