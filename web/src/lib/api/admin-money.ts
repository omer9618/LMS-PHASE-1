/**
 * The admin money API: payment verification (#63–#67), orders, refunds and adjustments (#82, #83),
 * payouts and concerns (#85–#89), finance views (#104–#106). Money is a string of minor units.
 * Every response is checked with its zod schema (./schemas/admin).
 */
import { clean } from './admin';
import { api } from './client';
import * as schema from './schemas/admin';
import type { z } from 'zod';
import type { confirmPaymentForm, payoutForm, rejectPaymentForm } from '@/lib/forms/admin';
import { paged } from './schemas/common';

export type {
  AdminLedgerEntry as LedgerEntry,
  AdminOrder,
  AdminPayout as Payout,
  AdminPayoutDispute as PayoutDispute,
  CoveredSale,
  CurrencyFinancialSummary,
  DuplicateTransactionIdWarning,
  FinancialSummary,
  MismatchAction,
  OpenConcern,
  OpenConcernsSummary,
  PaymentDecisionResult,
  QueueMetrics,
  RejectionReason,
  TeacherSale,
  TeacherStatement,
  VerificationQueueEntry,
} from './schemas/admin';
export type { OrderStatus, PaymentProof } from './schemas/orders';
export type { CurrencyBalance, PayoutStatus, SalesTotals } from './schemas/teacher';

// ── Payment verification and orders ──

export const REJECTION_REASONS = schema.rejectionReason.options;

export const getVerificationQueue = (
  query: { limit?: number; offset?: number },
  signal?: AbortSignal,
) =>
  api.get('/admin/verification/queue', paged(schema.verificationQueueEntry), clean(query), signal);

export const getVerificationMetrics = (signal?: AbortSignal) =>
  api.get('/admin/verification/metrics', schema.queueMetrics, undefined, signal);

/** The body of a payment confirmation: what `confirmPaymentForm` produces. */
export type ConfirmPaymentInput = z.output<ReturnType<typeof confirmPaymentForm>>;

export const confirmPayment = (orderId: string, body: ConfirmPaymentInput) =>
  api.post(`/admin/verification/orders/${orderId}/confirm`, schema.paymentDecisionResult, body);

export const rejectPayment = (orderId: string, body: z.output<typeof rejectPaymentForm>) =>
  api.post(`/admin/verification/orders/${orderId}/reject`, schema.paymentDecisionResult, body);

export const getOrder = (orderId: string, signal?: AbortSignal) =>
  api.get(`/admin/orders/${orderId}`, schema.adminOrder, undefined, signal);

// ── Ledger: refunds and adjustments ──

export const recordRefund = (
  orderId: string,
  body: { amountMinor: string; transferDate: string; transactionId: string; reason: string },
) => api.post(`/admin/orders/${orderId}/refund`, schema.refundResult, body);

export const recordAdjustment = (
  teacherId: string,
  body: { amountMinor: string; currency: string; reason: string },
) => api.post(`/admin/teachers/${teacherId}/ledger/adjustments`, schema.adjustmentResult, body);

// ── Payouts and concerns ──

export const getPayout = (payoutId: string, signal?: AbortSignal) =>
  api.get(`/admin/payouts/${payoutId}`, schema.payoutWithSales, undefined, signal);

export type RecordPayoutInput = z.output<typeof payoutForm>;

export const recordPayout = (teacherId: string, body: RecordPayoutInput) =>
  api.post(`/admin/teachers/${teacherId}/payouts`, schema.payoutRecorded, body);

export const resolvePayoutConcern = (
  payoutId: string,
  body: { resolutionNotes: string; adjustmentAmountMinor?: string; adjustmentCurrency?: string },
) => api.post(`/admin/payouts/${payoutId}/concerns/resolve`, schema.payoutOnly, body);

export const listOpenConcerns = (signal?: AbortSignal) =>
  api.get('/admin/payout-concerns', schema.openConcernsSummary, undefined, signal);

// ── Finance ──

export const getFinancialSummary = (query: { from?: string; to?: string }, signal?: AbortSignal) =>
  api.get('/admin/finance/summary', schema.financialSummary, clean(query), signal);

export const getTeacherStatement = (teacherId: string, signal?: AbortSignal) =>
  api.get(`/admin/teachers/${teacherId}/statement`, schema.teacherStatement, undefined, signal);
