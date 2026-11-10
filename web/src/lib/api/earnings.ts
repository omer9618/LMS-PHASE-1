import { api } from './client';
import * as schema from './schemas/teacher';
import type { LedgerEntry, PayoutSummary } from './schemas/teacher';

// ── Teacher earnings and payouts (#78–#89). Money is minor units as strings. ──

export type {
  CurrencyBalance,
  EarningsDashboard,
  LedgerEntry,
  LedgerEntryType,
  PayoutDetail,
  PayoutDispute,
  PayoutStatus,
  PayoutSummary,
  SaleItem,
  SalesTotals,
} from './schemas/teacher';

export const earningsApi = {
  dashboard: (signal?: AbortSignal) =>
    api.get('/teacher/earnings', schema.earningsDashboard, undefined, signal),
  payout: (payoutId: string, signal?: AbortSignal) =>
    api.get(`/teacher/payouts/${payoutId}`, schema.payoutDetail, undefined, signal),
  raiseConcern: (payoutId: string, reason: string) =>
    api.post(`/teacher/payouts/${payoutId}/concerns`, { reason }),
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
