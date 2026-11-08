/**
 * The admin money API: payment verification (#63–#67), orders, refunds and adjustments (#82, #83),
 * payouts and concerns (#85–#89), finance views (#104–#106). Money is a string of minor units.
 */
import { clean, type AdminUser } from './admin';
import { api } from './client';
import type { Paged } from './types';

// ── Payment verification and orders ──

export type OrderStatus =
  'PENDING' | 'PROOF_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'LAPSED' | 'REFUNDED';
export type MismatchAction = 'CONFIRM_ANYWAY' | 'REQUEST_TOP_UP' | 'REJECT';
export type RejectionReason =
  | 'NO_PAYMENT_RECEIVED'
  | 'AMOUNT_SHORT'
  | 'INVALID_TRANSACTION_ID'
  | 'DUPLICATE_TRANSACTION'
  | 'OTHER';

export const REJECTION_REASONS: RejectionReason[] = [
  'NO_PAYMENT_RECEIVED',
  'AMOUNT_SHORT',
  'INVALID_TRANSACTION_ID',
  'DUPLICATE_TRANSACTION',
  'OTHER',
];

export interface PaymentProof {
  id: string;
  transactionId: string;
  amountClaimedMinor: string | null;
  hasFile: boolean;
  fileUrl: string | null;
  submittedAt: string;
}

export interface DuplicateTransactionIdWarning {
  transactionId: string;
  conflictingOrderIds: string[];
  conflictingPaymentReferences: string[];
  message: string;
}

export interface VerificationQueueEntry {
  orderId: string;
  paymentReference: string;
  student: { id: string; email: string; fullName: string | null };
  totalMinor: string;
  currency: string;
  items: Array<{ courseTitle: string; teacherName: string | null; priceMinor: string }>;
  proofs: PaymentProof[];
  waitingSince: string | null;
  waitingMinutes: number | null;
  overTurnaround: boolean;
  claimed: { claimedMinor: string | null; differenceMinor: string | null; mismatch: boolean };
  duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[];
}

export interface QueueMetrics {
  queueSize: number;
  turnaroundHours: number;
  oldestWaitingSince: string | null;
  oldestWaitingMinutes: number | null;
  oldestOverTurnaround: boolean;
  overTurnaroundCount: number;
}

export interface PaymentDecisionResult {
  orderId: string;
  paymentReference: string;
  status: OrderStatus;
  outcome: string;
  totalMinor: string;
  amountReceivedMinor: string | null;
  differenceMinor: string | null;
  mismatchAction: string | null;
  rejectionReason: string | null;
  enrollmentsGranted: number;
  ledgerEntriesWritten: number;
}

export const getVerificationQueue = (
  query: { limit?: number; offset?: number },
  signal?: AbortSignal,
) => api.get<Paged<VerificationQueueEntry>>('/admin/verification/queue', clean(query), signal);

export const getVerificationMetrics = (signal?: AbortSignal) =>
  api.get<QueueMetrics>('/admin/verification/metrics', undefined, signal);

export interface ConfirmPaymentInput {
  amountReceivedMinor: string;
  valueDate: string;
  mismatchAction?: MismatchAction;
  rejectionReason?: RejectionReason;
  notes?: string;
}

export const confirmPayment = (orderId: string, body: ConfirmPaymentInput) =>
  api.post<PaymentDecisionResult>(`/admin/verification/orders/${orderId}/confirm`, body);

export const rejectPayment = (
  orderId: string,
  body: { rejectionReason: RejectionReason; notes?: string },
) => api.post<PaymentDecisionResult>(`/admin/verification/orders/${orderId}/reject`, body);

export interface AdminOrder {
  id: string;
  studentId: string;
  paymentReference: string;
  totalMinor: string;
  currency: string;
  status: OrderStatus;
  expiresAt: string | null;
  createdAt: string;
  verifiedAt: string | null;
  student: { id: string; email: string; fullName: string | null };
  items: Array<{
    id: string;
    courseId: string;
    teacherId: string;
    priceMinor: string;
    commissionRateBps: number;
    commissionMinor: string;
    netTeacherMinor: string;
    course: { id: string; title: string };
    teacher: { id: string; email: string; fullName: string | null };
  }>;
  proofs: PaymentProof[];
  verifications: Array<{
    id: string;
    proofId: string | null;
    outcome: string;
    amountReceivedMinor: string | null;
    valueDate: string | null;
    mismatchAction: string | null;
    rejectionReason: string | null;
    notes: string | null;
    verifiedAt: string;
  }>;
  duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[];
}

export const getOrder = (orderId: string, signal?: AbortSignal) =>
  api.get<AdminOrder>(`/admin/orders/${orderId}`, undefined, signal);

// ── Ledger: refunds and adjustments ──

export interface LedgerEntry {
  id: string;
  teacherId: string;
  type: 'EARNING' | 'PAYOUT' | 'REFUND' | 'ADJUSTMENT';
  amountMinor: string;
  currency: string;
  orderItemId: string | null;
  payoutId: string | null;
  refundId: string | null;
  description: string;
  createdById: string | null;
  createdAt: string;
}

export interface CurrencyBalance {
  currency: string;
  balanceMinor: string;
  earningsMinor: string;
  refundsMinor: string;
  payoutsMinor: string;
  adjustmentsMinor: string;
  entryCount: number;
}

export const recordRefund = (
  orderId: string,
  body: { amountMinor: string; transferDate: string; transactionId: string; reason: string },
) =>
  api.post<{ orderId: string; status: OrderStatus; enrollmentsRevoked: number }>(
    `/admin/orders/${orderId}/refund`,
    body,
  );

export const recordAdjustment = (
  teacherId: string,
  body: { amountMinor: string; currency: string; reason: string },
) =>
  api.post<{ entry: LedgerEntry; balance: CurrencyBalance }>(
    `/admin/teachers/${teacherId}/ledger/adjustments`,
    body,
  );

// ── Payouts and concerns ──

export type PayoutStatus = 'PENDING' | 'ACCEPTED' | 'DISPUTED' | 'RESOLVED';

export interface PayoutDispute {
  id: string;
  payoutId: string;
  teacherId: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionNotes: string | null;
  adjustmentLedgerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: string; email: string; fullName: string | null } | null;
}

export interface Payout {
  id: string;
  teacherId: string;
  amountMinor: string;
  method: string | null;
  transactionId: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: PayoutStatus;
  recordedAt: string;
  transferDate: string;
  disputeDeadline: string;
  acceptedAt: string | null;
  teacher?: { id: string; email: string; fullName: string | null };
  recordedBy?: { id: string; email: string; fullName: string | null } | null;
  ledgerEntries?: Array<{
    id: string;
    amountMinor: string;
    currency: string;
    description: string;
    createdAt: string;
  }>;
  disputes?: PayoutDispute[];
}

export interface CoveredSale {
  orderItemId: string;
  orderId: string;
  paymentReference: string;
  courseTitle: string;
  priceMinor: string;
  commissionMinor: string;
  netTeacherMinor: string;
  currency: string;
  verifiedAt: string | null;
}

export const listTeacherPayouts = (teacherId: string, signal?: AbortSignal) =>
  api.get<Payout[]>(`/admin/teachers/${teacherId}/payouts`, undefined, signal);

export const getPayout = (payoutId: string, signal?: AbortSignal) =>
  api.get<{ payout: Payout; coveredSales: CoveredSale[] }>(
    `/admin/payouts/${payoutId}`,
    undefined,
    signal,
  );

export interface RecordPayoutInput {
  amountMinor: string;
  currency: string;
  method?: string;
  transactionId: string;
  transferDate: string;
  periodStart?: string;
  periodEnd?: string;
}

export const recordPayout = (teacherId: string, body: RecordPayoutInput) =>
  api.post<{ payout: Payout; remainingBalance: CurrencyBalance }>(
    `/admin/teachers/${teacherId}/payouts`,
    body,
  );

export const resolvePayoutConcern = (
  payoutId: string,
  body: { resolutionNotes: string; adjustmentAmountMinor?: string; adjustmentCurrency?: string },
) => api.post<{ payout: Payout }>(`/admin/payouts/${payoutId}/concerns/resolve`, body);

export interface OpenConcern {
  id: string;
  payoutId: string;
  teacherId: string;
  reason: string;
  status: 'OPEN';
  createdAt: string;
  ageHours: number;
  ageDays: number;
  teacher: { id: string; email: string; fullName: string | null };
  payout: {
    id: string;
    amountMinor: string;
    transactionId: string;
    status: PayoutStatus;
    transferDate: string;
    disputeDeadline: string;
    ledgerEntries: Array<{ currency: string }>;
  };
}

export interface OpenConcernsSummary {
  generatedAt: string;
  count: number;
  oldestAgeHours: number | null;
  items: OpenConcern[];
}

export const listOpenConcerns = (signal?: AbortSignal) =>
  api.get<OpenConcernsSummary>('/admin/payout-concerns', undefined, signal);

// ── Finance ──

export interface CurrencyFinancialSummary {
  currency: string;
  confirmedSalesCount: number;
  confirmedSalesGrossMinor: string;
  commissionRetainedMinor: string;
  teacherEarningsMinor: string;
  refundsCount: number;
  refundsMinor: string;
  teacherRefundDebitsMinor: string;
  adjustmentsMinor: string;
  payoutsCount: number;
  payoutsMinor: string;
  periodNetLiabilityChangeMinor: string;
  outstandingLiabilityMinor: string;
}

export interface FinancialSummary {
  period: { from: string | null; to: string | null };
  currencies: CurrencyFinancialSummary[];
}

export const getFinancialSummary = (query: { from?: string; to?: string }, signal?: AbortSignal) =>
  api.get<FinancialSummary>('/admin/finance/summary', clean(query), signal);

export interface TeacherSale {
  id: string;
  orderId: string;
  paymentReference: string;
  orderStatus: string;
  currency: string;
  courseTitle: string;
  priceMinor: string;
  commissionRateBps: number;
  commissionMinor: string;
  netTeacherMinor: string;
  orderCreatedAt: string;
  orderVerifiedAt: string | null;
}

export interface SalesTotals {
  currency: string;
  itemCount: number;
  grossMinor: string;
  commissionMinor: string;
  netTeacherMinor: string;
}

export interface TeacherStatement {
  teacher: AdminUser;
  balances: CurrencyBalance[];
  sales: {
    pending: { items: TeacherSale[]; totalsByCurrency: SalesTotals[] };
    confirmed: { items: TeacherSale[]; totalsByCurrency: SalesTotals[] };
  };
  refunds: { count: number; items: LedgerEntry[] };
  adjustments: { count: number; items: LedgerEntry[] };
  payouts: { count: number; items: Payout[] };
  ledger: { count: number; items: LedgerEntry[] };
}

export const getTeacherStatement = (teacherId: string, signal?: AbortSignal) =>
  api.get<TeacherStatement>(`/admin/teachers/${teacherId}/statement`, undefined, signal);
