import { MismatchAction, RejectionReason } from '@prisma/client';
import { z } from 'zod';

const positiveMoneyMinor = z
  .string()
  .regex(/^[1-9]\d{0,17}$/, 'Must be a positive whole number of minor units, sent as a string')
  .transform((value) => BigInt(value));

const notes = z.string().trim().max(1000).optional();

export const verificationOrderParamsSchema = z.strictObject({ orderId: z.uuid() });
export type VerificationOrderParams = z.infer<typeof verificationOrderParamsSchema>;

/**
 * #64, #66: the amount actually received for the order (all transfers together) and the bank's
 * value date are required. `mismatchAction` is required when the amount differs from the total.
 */
export const confirmPaymentSchema = z.strictObject({
  amountReceivedMinor: positiveMoneyMinor,
  valueDate: z.iso.date(),
  mismatchAction: z.enum(MismatchAction).optional(),
  /** Only with mismatchAction REJECT on an overpayment; a short payment is AMOUNT_SHORT. */
  rejectionReason: z.enum(RejectionReason).optional(),
  notes,
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

/** #65: a reason from the list is required; notes are required for OTHER. */
export const rejectPaymentSchema = z.strictObject({
  rejectionReason: z.enum(RejectionReason),
  notes,
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const queueQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;
