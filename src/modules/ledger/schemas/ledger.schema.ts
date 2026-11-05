import { z } from 'zod';

const positiveMoneyMinor = z
  .string()
  .regex(/^[1-9]\d{0,17}$/, 'Must be a positive whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

export const refundOrderParamsSchema = z.strictObject({
  orderId: z.uuid(),
});
export type RefundOrderParams = z.infer<typeof refundOrderParamsSchema>;

/**
 * #82 (FR-7.14): Admin records a refund on a verified order with amount, transfer date,
 * bank transaction ID, and reason.
 */
export const recordRefundSchema = z.strictObject({
  amountMinor: positiveMoneyMinor,
  transferDate: z.iso.date(),
  transactionId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(1000),
});
export type RecordRefundInput = z.infer<typeof recordRefundSchema>;