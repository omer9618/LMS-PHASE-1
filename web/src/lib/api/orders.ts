import { api, type ApiClient } from './client';
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

export function ordersApi(client: ApiClient = api) {
  return {
    quote: (courseIds: string[]) => client.post('/cart/quote', schema.cartQuote, { courseIds }),
    createOrder: (courseIds: string[]) =>
      client.post('/orders', schema.studentOrder, { courseIds }),
    list: () => client.get('/me/orders', schema.studentOrders),
    get: (orderId: string) => client.get(orderPath(orderId), schema.studentOrder),
    receipt: (orderId: string) => client.get(`${orderPath(orderId)}/receipt`, schema.orderReceipt),
    submitProof: (orderId: string, input: ProofInput) =>
      client.postForm(`${orderPath(orderId)}/proofs`, schema.submittedProof, proofForm(input)),
  };
}

export type OrdersApi = ReturnType<typeof ordersApi>;

/** The browser's purchase API. */
export const orders = ordersApi();
