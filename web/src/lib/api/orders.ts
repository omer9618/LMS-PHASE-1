import { api } from './client';
import * as schema from './schemas/orders';

/**
 * Student purchase API (#54–#62): cart quote, checkout, my orders, payment proofs and receipts.
 * Money is a string of minor units; dates are ISO strings.
 */

export type {
  CartQuote,
  LastPaymentDecision,
  OrderGuidance,
  OrderReceipt,
  OrderStatus,
  PaymentInstructions,
  PaymentProof,
  StudentOrder,
  SubmittedProof,
} from './schemas/orders';

export interface ProofInput {
  transactionId: string;
  /** Minor units as a string; omitted when the student does not state an amount. */
  amountClaimedMinor?: string;
  file?: File | null;
}

export function proofForm(input: ProofInput): FormData {
  const form = new FormData();
  form.append('transactionId', input.transactionId.trim());
  if (input.amountClaimedMinor) form.append('amountClaimedMinor', input.amountClaimedMinor);
  if (input.file) form.append('file', input.file);
  return form;
}

const orderPath = (orderId: string) => `/me/orders/${encodeURIComponent(orderId)}`;

/** The browser's purchase API. */
export const orders = {
  quote: (courseIds: string[]) => api.post('/cart/quote', schema.cartQuote, { courseIds }),
  createOrder: (courseIds: string[]) => api.post('/orders', schema.studentOrder, { courseIds }),
  list: () => api.get('/me/orders', schema.studentOrders),
  get: (orderId: string) => api.get(orderPath(orderId), schema.studentOrder),
  receipt: (orderId: string) => api.get(`${orderPath(orderId)}/receipt`, schema.orderReceipt),
  submitProof: (orderId: string, input: ProofInput) =>
    api.postForm(`${orderPath(orderId)}/proofs`, schema.submittedProof, proofForm(input)),
};

export type OrdersApi = typeof orders;
