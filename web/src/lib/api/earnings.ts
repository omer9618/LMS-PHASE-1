import { api } from './client';

// ── Teacher earnings and payouts (#78–#89). Money is minor units as strings. ──

export interface CurrencyBalance {
  currency: string;
  balanceMinor: string;
  earningsMinor: string;
  refundsMinor: string;
  payoutsMinor: string;
  adjustmentsMinor: string;
  entryCount: number;
}

export interface SaleItem {
  id: string;
  orderId: string;
  paymentReference: string;
  orderStatus: string;
  currency: string;
  courseId: string;
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

export type LedgerEntryType = 'EARNING' | 'PAYOUT' | 'REFUND' | 'ADJUSTMENT';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  amountMinor: string;
  currency: string;
  orderItemId: string | null;
  payoutId: string | null;
  refundId: string | null;
  description: string | null;
  createdAt: string;
}

export type PayoutStatus = 'PENDING' | 'ACCEPTED' | 'DISPUTED' | 'RESOLVED';

export interface PayoutSummary {
  id: string;
  amountMinor: string;
  method: string | null;
  transactionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: PayoutStatus;
  recordedAt: string;
  transferDate: string | null;
  disputeDeadline: string;
  acceptedAt: string | null;
}

/** GET /teacher/earnings (#84). */
export interface EarningsDashboard {
  balances: CurrencyBalance[];
  pendingSales: { items: SaleItem[]; totalsByCurrency: SalesTotals[] };
  confirmedSales: { items: SaleItem[]; totalsByCurrency: SalesTotals[] };
  ledgerEntries: LedgerEntry[];
  payouts: PayoutSummary[];
}

export interface PayoutDispute {
  id: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** GET /teacher/payouts/:id (#85). */
export interface PayoutDetail {
  payout: PayoutSummary & {
    ledgerEntries: Array<{ id: string; amountMinor: string; currency: string; createdAt: string }>;
    disputes: PayoutDispute[];
  };
  coveredSales: Array<{
    orderItemId: string;
    paymentReference: string;
    courseTitle: string;
    priceMinor: string;
    commissionMinor: string;
    netTeacherMinor: string;
    currency: string;
    verifiedAt: string | null;
  }>;
}

export const earningsApi = {
  dashboard: (signal?: AbortSignal) =>
    api.get<EarningsDashboard>('/teacher/earnings', undefined, signal),
  payout: (payoutId: string, signal?: AbortSignal) =>
    api.get<PayoutDetail>(`/teacher/payouts/${payoutId}`, undefined, signal),
  raiseConcern: (payoutId: string, reason: string) =>
    api.post<unknown>(`/teacher/payouts/${payoutId}/concerns`, { reason }),
};

/** A concern can be raised on a PENDING payout until its dispute deadline (#88). */
export function canRaiseConcern(
  payout: Pick<PayoutSummary, 'status' | 'disputeDeadline'>,
  now: Date = new Date(),
): boolean {
  return payout.status === 'PENDING' && now.getTime() < new Date(payout.disputeDeadline).getTime();
}

/** The currency a payout was paid in: from its ledger entry, else the teacher's only currency. */
export function payoutCurrency(
  payoutId: string,
  entries: readonly LedgerEntry[],
  fallback: string | null,
): string | null {
  return entries.find((e) => e.payoutId === payoutId)?.currency ?? fallback;
}
