import { DomainError } from '../../../common/errors/domain.error';

/**
 * Teacher ledger rules (#78, #79, #80, extended by payouts and refunds in M3). Pure.
 * The ledger is append-only: entries are never updated or deleted, and a teacher's
 * balance is the sum of their entries, per currency.
 * Earnings are positive; payouts and refunds are negative compensating entries;
 * manual adjustments are signed (positive credit or negative debit) compensating entries.
 */
export class LedgerRefusedError extends DomainError {
  readonly code = 'LEDGER_REFUSED';
}

export type LedgerEntryTypeValue = 'EARNING' | 'PAYOUT' | 'REFUND' | 'ADJUSTMENT';

export interface LedgerEntryDraft {
  teacherId: string;
  type: LedgerEntryTypeValue;
  amountMinor: bigint;
  currency: string;
  orderItemId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  description: string;
}

/** A confirmed order line, as frozen at purchase (#56). */
export interface ConfirmedOrderLine {
  orderItemId: string;
  teacherId: string;
  courseTitle: string;
  netTeacherMinor: bigint;
}

export interface EarningEntryDraft extends LedgerEntryDraft {
  type: 'EARNING';
  orderItemId: string;
}

export interface RefundEntryDraft extends LedgerEntryDraft {
  type: 'REFUND';
  orderItemId: string;
  refundId: string;
}

export interface PayoutEntryDraft extends LedgerEntryDraft {
  type: 'PAYOUT';
  payoutId: string;
}

export interface AdjustmentEntryDraft extends LedgerEntryDraft {
  type: 'ADJUSTMENT';
}

export interface BuildAdjustmentEntryInput {
  teacherId: string;
  amountMinor: bigint;
  currency: string;
  reason: string;
}

export interface BuildPayoutEntryInput {
  teacherId: string;
  payoutId: string;
  amountMinor: bigint;
  currency: string;
  description?: string;
}

/** Minimal ledger entry projection used for pure balance derivation (#79). */
export interface LedgerBalanceEntry {
  type: LedgerEntryTypeValue;
  amountMinor: bigint;
  currency: string;
}

/** Derived balance and component breakdown for a single currency (#79). */
export interface DerivedCurrencyBalance {
  currency: string;
  balanceMinor: bigint;
  earningsMinor: bigint;
  refundsMinor: bigint;
  payoutsMinor: bigint;
  adjustmentsMinor: bigint;
  entryCount: number;
}

/**
 * #78: Validates that a currency is a 3-letter uppercase ISO 4217 code.
 */
export function assertLedgerCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new LedgerRefusedError('Ledger currency must be a 3-letter ISO code', {
      reason: 'INVALID_CURRENCY',
      currency,
    });
  }
}

/**
 * #78: Validates append-only invariants on any ledger entry draft before insertion:
 * - valid 3-letter uppercase currency
 * - non-empty description
 * - sign invariant by entry type:
 *   - EARNING: amountMinor >= 0n, requires orderItemId
 *   - REFUND: amountMinor <= 0n, requires orderItemId and refundId
 *   - PAYOUT: amountMinor < 0n, requires payoutId
 *   - ADJUSTMENT: amountMinor !== 0n
 */
export function assertValidLedgerEntryDraft(draft: LedgerEntryDraft): void {
  assertLedgerCurrency(draft.currency);
  if (!draft.teacherId || draft.teacherId.trim().length === 0) {
    throw new LedgerRefusedError('Ledger entry requires a teacherId', {
      reason: 'MISSING_TEACHER_ID',
    });
  }
  if (!draft.description || draft.description.trim().length === 0) {
    throw new LedgerRefusedError('Ledger entry requires a description', {
      reason: 'EMPTY_DESCRIPTION',
      type: draft.type,
    });
  }

  switch (draft.type) {
    case 'EARNING':
      if (!draft.orderItemId) {
        throw new LedgerRefusedError('An earning entry must reference an order item', {
          reason: 'MISSING_ORDER_ITEM_ID',
        });
      }
      if (draft.amountMinor < 0n) {
        throw new LedgerRefusedError('An earning cannot be negative', {
          reason: 'NEGATIVE_EARNING',
          orderItemId: draft.orderItemId,
        });
      }
      break;

    case 'REFUND':
      if (!draft.orderItemId || !draft.refundId) {
        throw new LedgerRefusedError(
          'A refund ledger entry must reference both orderItemId and refundId',
          {
            reason: 'MISSING_REFUND_REFERENCE',
          },
        );
      }
      if (draft.amountMinor > 0n) {
        throw new LedgerRefusedError(
          'A refund compensating entry cannot be positive',
          {
            reason: 'POSITIVE_REFUND_ENTRY',
            orderItemId: draft.orderItemId,
          },
        );
      }
      break;

    case 'PAYOUT':
      if (!draft.payoutId) {
        throw new LedgerRefusedError('A payout ledger entry must reference a payoutId', {
          reason: 'MISSING_PAYOUT_ID',
        });
      }
      if (draft.amountMinor >= 0n) {
        throw new LedgerRefusedError(
          'A payout ledger entry must be a negative debit',
          {
            reason: 'NON_NEGATIVE_PAYOUT_ENTRY',
            payoutId: draft.payoutId,
          },
        );
      }
      break;

    case 'ADJUSTMENT':
      if (draft.amountMinor === 0n) {
        throw new LedgerRefusedError('A manual balance adjustment cannot be zero', {
          reason: 'ZERO_ADJUSTMENT',
        });
      }
      break;
  }
}

/**
 * #80: one EARNING entry per confirmed order line for its net teacher amount (price minus
 * commission), in the order's currency. Refuses negative amounts, bad currencies and a line
 * that already has an earning, so a retry can never pay a teacher twice.
 */
export function buildEarningEntries(
  lines: readonly ConfirmedOrderLine[],
  currency: string,
  paymentReference: string,
  orderItemIdsWithEarnings: ReadonlySet<string>,
): EarningEntryDraft[] {
  assertLedgerCurrency(currency);
  const seen = new Set<string>();
  return lines.map((line) => {
    if (orderItemIdsWithEarnings.has(line.orderItemId) || seen.has(line.orderItemId)) {
      throw new LedgerRefusedError('This order line already has an earning entry', {
        reason: 'ALREADY_RECORDED',
        orderItemId: line.orderItemId,
      });
    }
    seen.add(line.orderItemId);
    const draft: EarningEntryDraft = {
      teacherId: line.teacherId,
      type: 'EARNING',
      amountMinor: line.netTeacherMinor,
      currency,
      orderItemId: line.orderItemId,
      description: `Sale of "${line.courseTitle}" (order ${paymentReference})`,
    };
    assertValidLedgerEntryDraft(draft);
    return draft;
  });
}

/**
 * #78 / #82: Compensating REFUND entries reversing the teacher's net earning for each line
 * on a refunded order. Never edits or deletes the original EARNING row; writes a negative
 * entry (-netTeacherMinor) linked to both orderItemId and refundId. Refuses lines that
 * already have a REFUND entry so a refund cannot debit a teacher twice.
 */
export function buildRefundEntries(
  lines: readonly ConfirmedOrderLine[],
  currency: string,
  paymentReference: string,
  refundId: string,
  orderItemIdsWithRefunds: ReadonlySet<string>,
): RefundEntryDraft[] {
  assertLedgerCurrency(currency);
  if (!refundId || refundId.trim().length === 0) {
    throw new LedgerRefusedError('Refund ledger entries require a refundId', {
      reason: 'MISSING_REFUND_REFERENCE',
    });
  }
  const seen = new Set<string>();
  return lines.map((line) => {
    if (orderItemIdsWithRefunds.has(line.orderItemId) || seen.has(line.orderItemId)) {
      throw new LedgerRefusedError('This order line already has a refund ledger entry', {
        reason: 'REFUND_ALREADY_RECORDED',
        orderItemId: line.orderItemId,
      });
    }
    seen.add(line.orderItemId);
    if (line.netTeacherMinor < 0n) {
      throw new LedgerRefusedError('Order line net teacher amount cannot be negative', {
        reason: 'NEGATIVE_EARNING',
        orderItemId: line.orderItemId,
      });
    }
    const draft: RefundEntryDraft = {
      teacherId: line.teacherId,
      type: 'REFUND',
      amountMinor: -line.netTeacherMinor,
      currency,
      orderItemId: line.orderItemId,
      refundId,
      description: `Refund of "${line.courseTitle}" (order ${paymentReference})`,
    };
    assertValidLedgerEntryDraft(draft);
    return draft;
  });
}

/**
 * #78 / #83: Compensating ADJUSTMENT entry (signed: positive credit or negative debit)
 * with a mandatory human-readable reason.
 */
export function buildAdjustmentEntry(input: BuildAdjustmentEntryInput): AdjustmentEntryDraft {
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length === 0) {
    throw new LedgerRefusedError('Manual balance adjustment requires a reason', {
      reason: 'EMPTY_DESCRIPTION',
      type: 'ADJUSTMENT',
    });
  }
  const draft: AdjustmentEntryDraft = {
    teacherId: input.teacherId,
    type: 'ADJUSTMENT',
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: trimmedReason,
  };
  assertValidLedgerEntryDraft(draft);
  return draft;
}

/**
 * #78 / #85: Compensating PAYOUT entry (negative debit) for a positive payout amount.
 */
export function buildPayoutEntry(input: BuildPayoutEntryInput): PayoutEntryDraft {
  if (input.amountMinor <= 0n) {
    throw new LedgerRefusedError('Payout amount must be positive', {
      reason: 'NON_POSITIVE_PAYOUT_AMOUNT',
    });
  }
  const description = input.description?.trim() || `Payout (${input.payoutId})`;
  const draft: PayoutEntryDraft = {
    teacherId: input.teacherId,
    type: 'PAYOUT',
    amountMinor: -input.amountMinor,
    currency: input.currency,
    payoutId: input.payoutId,
    description,
  };
  assertValidLedgerEntryDraft(draft);
  return draft;
}

/**
 * #79 (FR-8.2): Computes derived balances per currency as the exact sum of ledger entries.
 * No balance is ever stored in the database; balanceMinor === earningsMinor + refundsMinor + payoutsMinor + adjustmentsMinor.
 */
export function computeDerivedBalances(
  entries: readonly LedgerBalanceEntry[],
): DerivedCurrencyBalance[] {
  const byCurrency = new Map<string, DerivedCurrencyBalance>();

  for (const entry of entries) {
    assertLedgerCurrency(entry.currency);
    let summary = byCurrency.get(entry.currency);
    if (!summary) {
      summary = {
        currency: entry.currency,
        balanceMinor: 0n,
        earningsMinor: 0n,
        refundsMinor: 0n,
        payoutsMinor: 0n,
        adjustmentsMinor: 0n,
        entryCount: 0,
      };
      byCurrency.set(entry.currency, summary);
    }

    summary.balanceMinor += entry.amountMinor;
    summary.entryCount += 1;

    switch (entry.type) {
      case 'EARNING':
        summary.earningsMinor += entry.amountMinor;
        break;
      case 'REFUND':
        summary.refundsMinor += entry.amountMinor;
        break;
      case 'PAYOUT':
        summary.payoutsMinor += entry.amountMinor;
        break;
      case 'ADJUSTMENT':
        summary.adjustmentsMinor += entry.amountMinor;
        break;
    }
  }

  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * #79 (FR-8.2): Computes the derived balance for a single requested currency (0n if no entries exist).
 */
export function computeCurrencyBalance(
  entries: readonly LedgerBalanceEntry[],
  currency: string,
): DerivedCurrencyBalance {
  assertLedgerCurrency(currency);
  const matching = entries.filter((entry) => entry.currency === currency);
  const computed = computeDerivedBalances(matching)[0];
  return (
    computed ?? {
      currency,
      balanceMinor: 0n,
      earningsMinor: 0n,
      refundsMinor: 0n,
      payoutsMinor: 0n,
      adjustmentsMinor: 0n,
      entryCount: 0,
    }
  );
}
/** Order statuses for sales that are awaiting payment or admin verification (#81). */
export const PENDING_SALE_ORDER_STATUSES = ['PENDING', 'PROOF_SUBMITTED'] as const;
/** Order statuses for sales that have been verified (#81). */
export const CONFIRMED_SALE_ORDER_STATUSES = ['VERIFIED'] as const;

export type SaleOrderStatusValue =
  | 'PENDING'
  | 'PROOF_SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'LAPSED'
  | 'REFUNDED';

/** A teacher's order line item with its parent order context (#81, #84). */
export interface TeacherSaleOrderItem {
  id: string;
  orderId: string;
  paymentReference: string;
  orderStatus: SaleOrderStatusValue;
  currency: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  priceMinor: bigint;
  commissionRateBps: number;
  commissionMinor: bigint;
  netTeacherMinor: bigint;
  orderCreatedAt: Date;
  orderVerifiedAt: Date | null;
}

/** Aggregated totals per currency for a bucket of teacher sales (#81, #84). */
export interface TeacherSalesCurrencyTotals {
  currency: string;
  itemCount: number;
  grossMinor: bigint;
  commissionMinor: bigint;
  netTeacherMinor: bigint;
}

/**
 * #81 (FR-8.3): Separation of unverified (pending) sales from confirmed sales,
 * alongside the teacher's derived earned balance from the ledger (#79).
 */
export interface SeparatedTeacherSales {
  pending: {
    items: TeacherSaleOrderItem[];
    totalsByCurrency: TeacherSalesCurrencyTotals[];
  };
  confirmed: {
    items: TeacherSaleOrderItem[];
    totalsByCurrency: TeacherSalesCurrencyTotals[];
  };
  earnedBalances: DerivedCurrencyBalance[];
}

function summarizeSalesByCurrency(
  items: readonly TeacherSaleOrderItem[],
): TeacherSalesCurrencyTotals[] {
  const byCurrency = new Map<string, TeacherSalesCurrencyTotals>();
  for (const item of items) {
    assertLedgerCurrency(item.currency);
    let summary = byCurrency.get(item.currency);
    if (!summary) {
      summary = {
        currency: item.currency,
        itemCount: 0,
        grossMinor: 0n,
        commissionMinor: 0n,
        netTeacherMinor: 0n,
      };
      byCurrency.set(item.currency, summary);
    }
    summary.itemCount += 1;
    summary.grossMinor += item.priceMinor;
    summary.commissionMinor += item.commissionMinor;
    summary.netTeacherMinor += item.netTeacherMinor;
  }
  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * #81 (FR-8.3): Separates a teacher's order items into pending (PENDING, PROOF_SUBMITTED)
 * versus confirmed (VERIFIED) sales, and keeps unverified sales strictly separate from
 * the teacher's earned ledger balance.
 * Rejected, lapsed, and refunded order items are excluded from both active pending and confirmed sales.
 */
export function separatePendingAndConfirmedSales(
  items: readonly TeacherSaleOrderItem[],
  ledgerEntries: readonly LedgerBalanceEntry[],
): SeparatedTeacherSales {
  const pendingSet = new Set<string>(PENDING_SALE_ORDER_STATUSES);
  const confirmedSet = new Set<string>(CONFIRMED_SALE_ORDER_STATUSES);

  const pendingItems = items.filter((item) => pendingSet.has(item.orderStatus));
  const confirmedItems = items.filter((item) => confirmedSet.has(item.orderStatus));

  return {
    pending: {
      items: pendingItems,
      totalsByCurrency: summarizeSalesByCurrency(pendingItems),
    },
    confirmed: {
      items: confirmedItems,
      totalsByCurrency: summarizeSalesByCurrency(confirmedItems),
    },
    earnedBalances: computeDerivedBalances(ledgerEntries),
  };
}