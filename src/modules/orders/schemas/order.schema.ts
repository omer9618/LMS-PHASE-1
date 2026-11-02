import { z } from 'zod';

const courseId = z.uuid();

/** Money arrives as a string of minor units ("150000") and becomes a positive bigint. */
const positiveMoneyMinor = z
  .string()
  .regex(/^[1-9]\d{0,17}$/, 'Must be a positive whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

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

/** #58: student payment proof submission. Transaction id is required; file and claimed amount are optional. */
export const submitPaymentProofSchema = z.strictObject({
  transactionId: z
    .string()
    .trim()
    .min(2, 'Transaction ID is required')
    .max(120, 'Transaction ID must be at most 120 characters'),
  amountClaimedMinor: positiveMoneyMinor.optional(),
});
export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;
