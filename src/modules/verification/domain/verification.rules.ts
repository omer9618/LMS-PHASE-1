import { DomainError } from '../../../common/errors/domain.error';

/**
 * Payment verification rules (#63-#67). Pure.
 * Amounts are BigInt minor units. "Received" is the total the admin sees in the bank for this
 * order, across every transfer.
 */
export type MismatchActionValue = 'CONFIRM_ANYWAY' | 'REQUEST_TOP_UP' | 'REJECT';
export type RejectionReasonValue =
  | 'NO_PAYMENT_RECEIVED'
  | 'AMOUNT_SHORT'
  | 'INVALID_TRANSACTION_ID'
  | 'DUPLICATE_TRANSACTION'
  | 'OTHER';

export class VerificationRefusedError extends DomainError {
  readonly code = 'VERIFICATION_REFUSED';
}

export interface PaymentDecision {
  action: 'CONFIRM' | 'REQUEST_TOP_UP' | 'REJECT';
  /** received - total: negative when short, positive when overpaid, 0 when exact. */
  differenceMinor: bigint;
  mismatchAction: MismatchActionValue | null;
  /** Set when the decision rejects the payment. */
  rejectionReason: RejectionReasonValue | null;
}

/** "YYYY-MM-DD" of a UTC instant. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * #64, #66: what confirming with this amount means.
 * - Exact amount: confirm. A mismatch action is refused (there is no mismatch).
 * - Different amount: the difference is computed and a mismatch action is required:
 *   CONFIRM_ANYWAY confirms, REQUEST_TOP_UP (only when short) asks the student for the rest,
 *   REJECT rejects (reason AMOUNT_SHORT when short, else the given reason or OTHER).
 * The value date is the bank's date for the transfer and cannot be in the future.
 */
export function decidePaymentConfirmation(input: {
  totalMinor: bigint;
  amountReceivedMinor: bigint;
  valueDate: string;
  mismatchAction?: MismatchActionValue;
  rejectionReason?: RejectionReasonValue;
  now: Date;
}): PaymentDecision {
  if (input.valueDate > utcDate(input.now)) {
    throw new VerificationRefusedError('The value date cannot be in the future', {
      reason: 'VALUE_DATE_IN_FUTURE',
      valueDate: input.valueDate,
    });
  }
  const differenceMinor = input.amountReceivedMinor - input.totalMinor;
  if (differenceMinor === 0n) {
    if (input.mismatchAction) {
      throw new VerificationRefusedError('The amount matches the order total; no mismatch action', {
        reason: 'NO_MISMATCH',
      });
    }
    return { action: 'CONFIRM', differenceMinor, mismatchAction: null, rejectionReason: null };
  }
  const info = {
    totalMinor: input.totalMinor.toString(),
    amountReceivedMinor: input.amountReceivedMinor.toString(),
    differenceMinor: differenceMinor.toString(),
  };
  switch (input.mismatchAction) {
    case undefined:
      throw new VerificationRefusedError(
        'The amount received differs from the order total. Choose confirm anyway, request a top-up, or reject.',
        { reason: 'MISMATCH_ACTION_REQUIRED', ...info },
      );
    case 'CONFIRM_ANYWAY':
      return {
        action: 'CONFIRM',
        differenceMinor,
        mismatchAction: 'CONFIRM_ANYWAY',
        rejectionReason: null,
      };
    case 'REQUEST_TOP_UP':
      if (differenceMinor > 0n) {
        throw new VerificationRefusedError('A top-up can only be requested for a short payment', {
          reason: 'NOT_SHORT',
          ...info,
        });
      }
      return {
        action: 'REQUEST_TOP_UP',
        differenceMinor,
        mismatchAction: 'REQUEST_TOP_UP',
        rejectionReason: 'AMOUNT_SHORT',
      };
    case 'REJECT':
      return {
        action: 'REJECT',
        differenceMinor,
        mismatchAction: 'REJECT',
        rejectionReason: differenceMinor < 0n ? 'AMOUNT_SHORT' : (input.rejectionReason ?? 'OTHER'),
      };
  }
}

/** #65: a rejection needs a reason; OTHER also needs notes explaining it. */
export function assertRejectionReason(reason: RejectionReasonValue, notes: string | null): void {
  if (reason === 'OTHER' && !notes?.trim()) {
    throw new VerificationRefusedError(
      'Explain the rejection in the notes when the reason is OTHER',
      {
        reason: 'NOTES_REQUIRED',
      },
    );
  }
}

// ── Queue (#63) and metrics (#67) ──────────────────────────────────

export interface ProofFacts {
  id: string;
  transactionId: string;
  amountClaimedMinor: bigint | null;
  submittedAt: Date;
}

export interface DecisionFacts {
  outcome: 'CONFIRMED' | 'REJECTED';
  mismatchAction: MismatchActionValue | null;
  verifiedAt: Date;
}

/**
 * The proofs the admin is deciding on now: those submitted after the last full rejection.
 * A top-up request does not start a new round: the earlier partial transfer still counts.
 */
export function currentRoundProofs<P extends ProofFacts>(
  proofs: readonly P[],
  decisions: readonly DecisionFacts[],
): P[] {
  const lastRejection = [...decisions]
    .filter((d) => d.outcome === 'REJECTED' && d.mismatchAction !== 'REQUEST_TOP_UP')
    .at(-1);
  if (!lastRejection) return [...proofs];
  return proofs.filter((p) => p.submittedAt.getTime() > lastRejection.verifiedAt.getTime());
}

/**
 * When the order started waiting for the admin: the first proof after the last decision of any
 * kind (or the first proof at all).
 */
export function waitingSince(
  proofs: readonly ProofFacts[],
  decisions: readonly DecisionFacts[],
): Date | null {
  const lastDecisionAt = decisions.at(-1)?.verifiedAt.getTime() ?? -Infinity;
  const waiting = proofs
    .filter((p) => p.submittedAt.getTime() > lastDecisionAt)
    .map((p) => p.submittedAt.getTime());
  if (waiting.length === 0) {
    // Defensive: a PROOF_SUBMITTED order always has a proof after its last decision.
    const last = proofs.at(-1);
    return last ? last.submittedAt : null;
  }
  return new Date(Math.min(...waiting));
}

export interface ClaimedAmountCheck {
  /** Sum of the amounts the student claimed in the current round, or null if none claimed. */
  claimedMinor: bigint | null;
  /** claimed - total, or null if nothing was claimed. */
  differenceMinor: bigint | null;
  mismatch: boolean;
}

/** #63, #66: does what the student says they paid match the order total? */
export function checkClaimedAmount(
  totalMinor: bigint,
  roundProofs: readonly ProofFacts[],
): ClaimedAmountCheck {
  const claimed = roundProofs
    .map((p) => p.amountClaimedMinor)
    .filter((a): a is bigint => a !== null);
  if (claimed.length === 0) return { claimedMinor: null, differenceMinor: null, mismatch: false };
  const claimedMinor = claimed.reduce((sum, a) => sum + a, 0n);
  const differenceMinor = claimedMinor - totalMinor;
  return { claimedMinor, differenceMinor, mismatch: differenceMinor !== 0n };
}

/** Whole minutes between two instants (never negative). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

export interface QueueMetrics {
  queueSize: number;
  turnaroundHours: number;
  oldestWaitingSince: Date | null;
  oldestWaitingMinutes: number | null;
  /** Is the oldest order past the published turnaround? */
  oldestOverTurnaround: boolean;
  overTurnaroundCount: number;
}

/** What the database counted about the queue (see VerificationDao.getQueueStats). */
export interface QueueStats {
  size: number;
  oldestWaitingSince: Date | null;
  /** Orders waiting longer than the turnaround. */
  overTurnaround: number;
}

/** #67: queue size, oldest waiting order, and how many are past the published turnaround. */
export function queueMetrics(stats: QueueStats, turnaroundHours: number, now: Date): QueueMetrics {
  const oldestMinutes = stats.oldestWaitingSince
    ? minutesBetween(stats.oldestWaitingSince, now)
    : null;
  return {
    queueSize: stats.size,
    turnaroundHours,
    oldestWaitingSince: stats.oldestWaitingSince,
    oldestWaitingMinutes: oldestMinutes,
    oldestOverTurnaround: oldestMinutes !== null && oldestMinutes > turnaroundHours * 60,
    overTurnaroundCount: stats.overTurnaround,
  };
}
