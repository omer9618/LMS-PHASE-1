import { api, type ApiClient } from './client';

/**
 * Student purchase API (#54–#62): cart quote, checkout, my orders, payment proofs and receipts.
 * Money is a string of minor units; dates are ISO strings.
 */

export type OrderStatus =
  'PENDING' | 'PROOF_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'LAPSED' | 'REFUNDED';

/** POST /cart/quote */
export interface CartQuote {
  items: {
    courseId: string;
    title: string;
    teacherId: string;
    teacherName: string | null;
    priceMinor: string;
    currency: string;
  }[];
  currency: string;
  totalMinor: string;
  teacherCount: number;
}

export interface PaymentProof {
  id: string;
  transactionId: string;
  amountClaimedMinor: string | null;
  hasFile: boolean;
  fileUrl: string | null;
  submittedAt: string;
}

export interface PaymentInstructions {
  bankTransferInstructions: string;
  paymentReference: string;
  amountMinor: string;
  currency: string;
  expiresAt: string | null;
  verificationTurnaroundHours: number;
}

export type LastPaymentDecision =
  | { kind: 'REJECTED'; reason: string; notes: string | null }
  | { kind: 'TOP_UP_REQUESTED'; shortfallMinor: string };

export interface OrderGuidance {
  statusLabel: string;
  nextAction: 'SUBMIT_PROOF' | 'WAIT_FOR_VERIFICATION' | 'NONE';
  canSubmitProof: boolean;
  whatHappensNext: string;
}

/** GET /me/orders, GET /me/orders/:id, POST /orders */
export interface StudentOrder {
  id: string;
  paymentReference: string;
  status: OrderStatus;
  totalMinor: string;
  currency: string;
  createdAt: string;
  expiresAt: string | null;
  verifiedAt: string | null;
  items: {
    courseId: string;
    courseTitle: string;
    teacherName: string | null;
    priceMinor: string;
  }[];
  proofs: PaymentProof[];
  paymentInstructions: PaymentInstructions;
  lastDecision: LastPaymentDecision | null;
  guidance: OrderGuidance;
}

/** POST /me/orders/:id/proofs */
export interface SubmittedProof {
  order: StudentOrder;
  proof: PaymentProof;
  duplicateTransactionIdWarning: {
    transactionId: string;
    conflictingPaymentReferences: string[];
    message: string;
  } | null;
}

/** GET /me/orders/:id/receipt */
export interface OrderReceipt {
  receiptNumber: string;
  orderId: string;
  paymentReference: string;
  issuedAt: string;
  student: { fullName: string | null; email: string };
  items: {
    courseId: string;
    courseTitle: string;
    teacherName: string | null;
    priceMinor: string;
  }[];
  totalMinor: string;
  currency: string;
}

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
    quote: (courseIds: string[]) => client.post<CartQuote>('/cart/quote', { courseIds }),
    createOrder: (courseIds: string[]) => client.post<StudentOrder>('/orders', { courseIds }),
    list: () => client.get<StudentOrder[]>('/me/orders'),
    get: (orderId: string) => client.get<StudentOrder>(orderPath(orderId)),
    receipt: (orderId: string) => client.get<OrderReceipt>(`${orderPath(orderId)}/receipt`),
    submitProof: (orderId: string, input: ProofInput) =>
      client.postForm<SubmittedProof>(`${orderPath(orderId)}/proofs`, proofForm(input)),
  };
}

export type OrdersApi = ReturnType<typeof ordersApi>;

/** The browser's purchase API. */
export const orders = ordersApi();
