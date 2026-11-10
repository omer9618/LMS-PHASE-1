import { z } from 'zod';
import { currencyCode, id, isoDateTime, minorUnits } from './common';

/** Student purchases (#54–#62): cart quote, orders, payment proofs, receipts. */

export const orderStatus = z.enum([
  'PENDING',
  'PROOF_SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'LAPSED',
  'REFUNDED',
]);
export type OrderStatus = z.infer<typeof orderStatus>;

/** POST /cart/quote */
export const cartQuote = z.object({
  items: z.array(
    z.object({
      courseId: id,
      title: z.string(),
      teacherId: id,
      teacherName: z.string().nullable(),
      priceMinor: minorUnits,
      currency: currencyCode,
    }),
  ),
  currency: currencyCode,
  totalMinor: minorUnits,
  teacherCount: z.number().int().nonnegative(),
});
export type CartQuote = z.infer<typeof cartQuote>;

export const paymentProof = z.object({
  id,
  transactionId: z.string(),
  amountClaimedMinor: minorUnits.nullable(),
  hasFile: z.boolean(),
  fileUrl: z.string().nullable(),
  submittedAt: isoDateTime,
});
export type PaymentProof = z.infer<typeof paymentProof>;

export const paymentInstructions = z.object({
  bankTransferInstructions: z.string(),
  paymentReference: z.string(),
  amountMinor: minorUnits,
  currency: currencyCode,
  expiresAt: isoDateTime.nullable(),
  verificationTurnaroundHours: z.number().nonnegative(),
});
export type PaymentInstructions = z.infer<typeof paymentInstructions>;

export const lastPaymentDecision = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('REJECTED'), reason: z.string(), notes: z.string().nullable() }),
  z.object({ kind: z.literal('TOP_UP_REQUESTED'), shortfallMinor: minorUnits }),
]);
export type LastPaymentDecision = z.infer<typeof lastPaymentDecision>;

export const orderGuidance = z.object({
  statusLabel: z.string(),
  nextAction: z.enum(['SUBMIT_PROOF', 'WAIT_FOR_VERIFICATION', 'NONE']),
  canSubmitProof: z.boolean(),
  whatHappensNext: z.string(),
});
export type OrderGuidance = z.infer<typeof orderGuidance>;

const orderLine = z.object({
  courseId: id,
  courseTitle: z.string(),
  teacherName: z.string().nullable(),
  priceMinor: minorUnits,
});

/** GET /me/orders/:id, POST /orders */
export const studentOrder = z.object({
  id,
  paymentReference: z.string(),
  status: orderStatus,
  totalMinor: minorUnits,
  currency: currencyCode,
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  verifiedAt: isoDateTime.nullable(),
  items: z.array(orderLine),
  proofs: z.array(paymentProof),
  paymentInstructions,
  lastDecision: lastPaymentDecision.nullable(),
  guidance: orderGuidance,
});
export type StudentOrder = z.infer<typeof studentOrder>;

/** GET /me/orders */
export const studentOrders = z.array(studentOrder);

/** POST /me/orders/:id/proofs */
export const submittedProof = z.object({
  order: studentOrder,
  proof: paymentProof,
  duplicateTransactionIdWarning: z
    .object({
      transactionId: z.string(),
      conflictingPaymentReferences: z.array(z.string()),
      message: z.string(),
    })
    .nullable(),
});
export type SubmittedProof = z.infer<typeof submittedProof>;

/** GET /me/orders/:id/receipt */
export const orderReceipt = z.object({
  receiptNumber: z.string(),
  orderId: id,
  paymentReference: z.string(),
  issuedAt: isoDateTime,
  student: z.object({ fullName: z.string().nullable(), email: z.string() }),
  items: z.array(orderLine),
  totalMinor: minorUnits,
  currency: currencyCode,
});
export type OrderReceipt = z.infer<typeof orderReceipt>;
