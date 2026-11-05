import { DomainError } from '../../../common/errors/domain.error';

/**
 * Payouts domain rules (#85-#89). Pure.
 */
export class PayoutRefusedError extends DomainError {
  readonly code = 'PAYOUT_REFUSED';
}

export type PayoutStatusValue = 'PENDING' | 'ACCEPTED' | 'DISPUTED' | 'RESOLVED';

export interface CoveredSaleItem {
  orderItemId: string;
  orderId: string;
  paymentReference: string;
  courseId: string;
  courseTitle: string;
  priceMinor: bigint;
  commissionRateBps: number;
  commissionMinor: bigint;
  netTeacherMinor: bigint;
  currency: string;
  verifiedAt: Date | null;
}

export interface ValidateRecordPayoutInput {
  teacherId: string;
  teacherRoles: readonly string[];
  amountMinor: bigint;
  currency: string;
  availableBalanceMinor: bigint;
  transactionId: string;
  transferDate: string;
  periodStart?: string;
  periodEnd?: string;
  disputeWindowDays: number;
  now: Date;
}

export interface PayoutRecordingPlan {
  amountMinor: bigint;
  currency: string;
  method: string;
  transactionId: string;
  transferDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  disputeDeadline: Date;
  ledgerDescription: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * #85 / #87: Computes the dispute deadline `disputeWindowDays` after `now`.
 */
export function computePayoutDisputeDeadline(now: Date, disputeWindowDays: number): Date {
  if (!Number.isInteger(disputeWindowDays) || disputeWindowDays < 1) {
    throw new PayoutRefusedError('Dispute window days must be a positive integer', {
      reason: 'INVALID_DISPUTE_WINDOW',
      disputeWindowDays,
    });
  }
  return new Date(now.getTime() + disputeWindowDays * DAY_MS);
}

/**
 * #85 (FR-8.5): Validates payout recording inputs and builds the payout recording plan:
 * - target user must hold TEACHER role
 * - currency must be 3-letter uppercase ISO code
 * - amountMinor must be > 0n and <= availableBalanceMinor
 * - transactionId must be non-empty
 * - if both periodStart and periodEnd are given, periodStart <= periodEnd
 */
export function buildPayoutRecordingPlan(
  input: ValidateRecordPayoutInput & { method?: string },
): PayoutRecordingPlan {
  if (!input.teacherRoles.includes('TEACHER')) {
    throw new PayoutRefusedError('Target user is not a teacher', {
      reason: 'NOT_A_TEACHER',
      teacherId: input.teacherId,
    });
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new PayoutRefusedError('Payout currency must be a 3-letter ISO code', {
      reason: 'INVALID_CURRENCY',
      currency: input.currency,
    });
  }
  if (input.amountMinor <= 0n) {
    throw new PayoutRefusedError('Payout amount must be positive', {
      reason: 'NON_POSITIVE_AMOUNT',
    });
  }
  if (input.amountMinor > input.availableBalanceMinor) {
    throw new PayoutRefusedError(
      'Payout amount exceeds the teacher’s available ledger balance',
      {
        reason: 'INSUFFICIENT_TEACHER_BALANCE',
        amountMinor: input.amountMinor.toString(),
        availableBalanceMinor: input.availableBalanceMinor.toString(),
        currency: input.currency,
      },
    );
  }
  const trimmedTxId = input.transactionId.trim();
  if (trimmedTxId.length === 0) {
    throw new PayoutRefusedError('Payout requires a bank transaction ID', {
      reason: 'MISSING_TRANSACTION_ID',
    });
  }

  const transferDate = new Date(`${input.transferDate}T00:00:00.000Z`);
  const periodStart = input.periodStart
    ? new Date(`${input.periodStart}T00:00:00.000Z`)
    : null;
  const periodEnd = input.periodEnd ? new Date(`${input.periodEnd}T00:00:00.000Z`) : null;

  if (periodStart && periodEnd && periodStart.getTime() > periodEnd.getTime()) {
    throw new PayoutRefusedError('Payout periodStart cannot be after periodEnd', {
      reason: 'INVALID_PERIOD_RANGE',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
  }

  const method = input.method?.trim() || 'BANK_TRANSFER';
  const disputeDeadline = computePayoutDisputeDeadline(input.now, input.disputeWindowDays);
  const periodLabel =
    input.periodStart && input.periodEnd
      ? ` (${input.periodStart} to ${input.periodEnd})`
      : '';

  return {
    amountMinor: input.amountMinor,
    currency: input.currency,
    method,
    transactionId: trimmedTxId,
    transferDate,
    periodStart,
    periodEnd,
    disputeDeadline,
    ledgerDescription: `Payout ${trimmedTxId}${periodLabel}`,
  };
}

/**
 * #85 / #86: Filters a teacher's confirmed sales to those covered by the payout's
 * period [periodStart, periodEnd] (inclusive of the end date's UTC day) and currency.
 * When no period bounds are specified, all confirmed sales in the currency are returned.
 */
export function selectCoveredSalesForPayout(
  confirmedSales: readonly CoveredSaleItem[],
  currency: string,
  periodStart: Date | null,
  periodEnd: Date | null,
): CoveredSaleItem[] {
  const startMs = periodStart ? periodStart.getTime() : null;
  // periodEnd is a @db.Date (00:00:00.000Z); include the full UTC day up to 23:59:59.999Z
  const endMs = periodEnd ? periodEnd.getTime() + DAY_MS - 1 : null;

  return confirmedSales.filter((sale) => {
    if (sale.currency !== currency) return false;
    if (startMs === null && endMs === null) return true;
    if (!sale.verifiedAt) return false;
    const t = sale.verifiedAt.getTime();
    if (startMs !== null && t < startMs) return false;
    if (endMs !== null && t > endMs) return false;
    return true;
  });
}
/**
 * #86 / #113: Formats minor units into a human-readable amount string (e.g. `PKR 1,200.00`).
 */
export function formatPayoutMoney(amountMinor: bigint, currency: string): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${wholeFormatted}.${cents}`;
}

/**
 * #86 / #113: Formats covered sales into itemised `[label, netAmount]` detail rows for the
 * teacher's payout notification email.
 */
export function buildPayoutCoverageEmailLines(
  coveredSales: readonly CoveredSaleItem[],
): Array<[item: string, netAmount: string]> {
  return coveredSales.map((sale) => [
    `Sale: ${sale.courseTitle} (${sale.paymentReference})`,
    formatPayoutMoney(sale.netTeacherMinor, sale.currency),
  ]);
}
/**
 * #87 (FR-8.7, FR-8.9): Determines whether a payout is due to be automatically accepted.
 * Only `PENDING` payouts whose `disputeDeadline <= now` qualify; `DISPUTED`, `ACCEPTED`,
 * and `RESOLVED` payouts are never auto-accepted by the passage of time.
 */
export function isPayoutDueToAutoAccept(
  payout: { status: PayoutStatusValue; disputeDeadline: Date },
  now: Date,
): boolean {
  return payout.status === 'PENDING' && payout.disputeDeadline.getTime() <= now.getTime();
}
export interface AssertCanRaisePayoutConcernInput {
  payoutId: string;
  status: PayoutStatusValue;
  disputeDeadline: Date;
  reason: string;
  now: Date;
}

/**
 * #88 (FR-8.7): Validates that a teacher can raise a concern on a payout:
 * - payout must currently be PENDING (not already DISPUTED, ACCEPTED, or RESOLVED)
 * - `now` must be strictly before `disputeDeadline` (concern blocked once the 7-day window has elapsed)
 * - reason must be non-empty.
 */
export function assertCanRaisePayoutConcern(input: AssertCanRaisePayoutConcernInput): string {
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length === 0) {
    throw new PayoutRefusedError('A payout concern requires a reason', {
      reason: 'EMPTY_CONCERN_REASON',
      payoutId: input.payoutId,
    });
  }
  if (input.status !== 'PENDING') {
    throw new PayoutRefusedError('A concern can only be raised on a pending payout', {
      reason: 'PAYOUT_NOT_PENDING',
      payoutId: input.payoutId,
      status: input.status,
    });
  }
  if (input.now.getTime() >= input.disputeDeadline.getTime()) {
    throw new PayoutRefusedError('The dispute window for this payout has closed', {
      reason: 'DISPUTE_WINDOW_CLOSED',
      payoutId: input.payoutId,
      disputeDeadline: input.disputeDeadline.toISOString(),
    });
  }
  return trimmedReason;
}
export type DisputeStatusValue = 'OPEN' | 'RESOLVED';

export interface AssertCanResolvePayoutConcernInput {
  payoutId: string;
  payoutStatus: PayoutStatusValue;
  openDisputeId: string | null;
  resolutionNotes: string;
  adjustmentAmountMinor?: bigint;
}

/**
 * #89 (FR-8.8): Validates that an admin can resolve a payout concern:
 * - payout must be DISPUTED with an OPEN dispute record
 * - resolutionNotes must be non-empty
 * - if adjustmentAmountMinor is provided, it must be non-zero
 * - No time limit applies to resolving an open concern (it stays open until resolved).
 */
export function assertCanResolvePayoutConcern(input: AssertCanResolvePayoutConcernInput): {
  disputeId: string;
  resolutionNotes: string;
} {
  const trimmedNotes = input.resolutionNotes.trim();
  if (trimmedNotes.length === 0) {
    throw new PayoutRefusedError('Resolving a payout concern requires resolution notes', {
      reason: 'EMPTY_RESOLUTION_NOTES',
      payoutId: input.payoutId,
    });
  }
  if (input.payoutStatus !== 'DISPUTED' || !input.openDisputeId) {
    throw new PayoutRefusedError('This payout does not have an open concern to resolve', {
      reason: 'NO_OPEN_CONCERN',
      payoutId: input.payoutId,
      status: input.payoutStatus,
    });
  }
  if (input.adjustmentAmountMinor !== undefined && input.adjustmentAmountMinor === 0n) {
    throw new PayoutRefusedError('Adjustment amount cannot be zero', {
      reason: 'ZERO_ADJUSTMENT',
      payoutId: input.payoutId,
    });
  }
  return {
    disputeId: input.openDisputeId,
    resolutionNotes: trimmedNotes,
  };
}
export interface OpenConcernCandidate {
  id: string;
  createdAt: Date;
}

export type AgedOpenConcern<T extends OpenConcernCandidate> = T & {
  /** Age in milliseconds since the concern was raised. */
  ageMs: number;
  /** Whole minutes since the concern was raised. */
  ageMinutes: number;
  /** Whole hours since the concern was raised. */
  ageHours: number;
  /** Whole days since the concern was raised. */
  ageDays: number;
};

export interface OpenConcernsSummary<T extends OpenConcernCandidate> {
  generatedAt: Date;
  count: number;
  oldestAgeHours: number | null;
  items: Array<AgedOpenConcern<T>>;
}

/**
 * #106 (FR-12.5): Annotates each open payout concern with its age (`ageMs`, `ageMinutes`,
 * `ageHours`, `ageDays`) relative to `now` and orders them oldest first so none is left unresolved.
 */
export function summariseOpenConcerns<T extends OpenConcernCandidate>(
  disputes: readonly T[],
  now: Date,
): OpenConcernsSummary<T> {
  const items: Array<AgedOpenConcern<T>> = [...disputes]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((dispute) => {
      const ageMs = Math.max(0, now.getTime() - dispute.createdAt.getTime());
      return {
        ...dispute,
        ageMs,
        ageMinutes: Math.floor(ageMs / 60_000),
        ageHours: Math.floor(ageMs / 3_600_000),
        ageDays: Math.floor(ageMs / DAY_MS),
      };
    });

  return {
    generatedAt: now,
    count: items.length,
    oldestAgeHours: items[0]?.ageHours ?? null,
    items,
  };
}