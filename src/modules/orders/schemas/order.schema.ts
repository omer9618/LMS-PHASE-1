import { z } from 'zod';

/** Money arrives as a string of minor units ("150000") and becomes a positive bigint. */
const positiveMoneyMinor = z
  .string()
  .regex(/^[1-9]\d{0,17}$/, 'Must be a positive whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

export const orderParamsSchema = z.strictObject({
  orderId: z.uuid(),
});
export type OrderParams = z.infer<typeof orderParamsSchema>;

/** #54: the cart lives on the client; the server validates and totals it. Up to 20 courses. */
export const quoteCartSchema = z.strictObject({
  courseIds: z.array(z.uuid()).min(1).max(20),
});
export type QuoteCartInput = z.infer<typeof quoteCartSchema>;

/** #55: same shape as the quote. */
export const createOrderSchema = quoteCartSchema;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * #58: multipart form fields (always strings). The transaction id is required; the file (field
 * `file`) and the claimed amount are optional.
 */
export const submitPaymentProofSchema = z.strictObject({
  transactionId: z
    .string()
    .trim()
    .min(2, 'Transaction ID is required')
    .max(120, 'Transaction ID must be at most 120 characters'),
  amountClaimedMinor: positiveMoneyMinor.optional(),
});
export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;
