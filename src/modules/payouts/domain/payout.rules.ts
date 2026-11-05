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