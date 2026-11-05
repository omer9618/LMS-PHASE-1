import { z } from 'zod';

const positiveMoneyMinor = z
  .string()
  .regex(/^[1-9]\d{0,17}$/, 'Must be a positive whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

export const payoutTeacherParamsSchema = z.strictObject({
  teacherId: z.uuid(),
});
export type PayoutTeacherParams = z.infer<typeof payoutTeacherParamsSchema>;

export const payoutIdParamsSchema = z.strictObject({
  payoutId: z.uuid(),
});
export type PayoutIdParams = z.infer<typeof payoutIdParamsSchema>;

/**
 * #85 (FR-8.5): Admin records a payout to a teacher with amount, transferDate,
 * bank transactionId, optional method, and optional covered sales period [periodStart, periodEnd].
 */
export const recordPayoutSchema = z.strictObject({
  amountMinor: positiveMoneyMinor,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO currency code')
    .default('PKR'),
  method: z.string().trim().min(1).max(100).optional(),
  transactionId: z.string().trim().min(1).max(200),
  transferDate: z.iso.date(),
  periodStart: z.iso.date().optional(),
  periodEnd: z.iso.date().optional(),
});
export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;
/**
 * #88 (FR-8.7): Teacher raises a concern on a payout within the 7-day dispute window.
 */
export const raisePayoutConcernSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});
export type RaisePayoutConcernInput = z.infer<typeof raisePayoutConcernSchema>;