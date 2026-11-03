import { DomainError } from '../../../common/errors/domain.error';

/**
 * Teacher ledger rules (#80, extended by payouts and refunds in M3). Pure.
 * The ledger is append-only: a teacher's balance is the sum of their entries, per currency.
 * Earnings are positive; payouts and refunds (later) are negative entries, never edits.
 */
export class LedgerRefusedError extends DomainError {
  readonly code = 'LEDGER_REFUSED';
}

/** A confirmed order line, as frozen at purchase (#56). */
export interface ConfirmedOrderLine {
  orderItemId: string;
  teacherId: string;
  courseTitle: string;
  netTeacherMinor: bigint;
}

export interface EarningEntryDraft {
  teacherId: string;
  type: 'EARNING';
  amountMinor: bigint;
  currency: string;
  orderItemId: string;
  description: string;
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
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new LedgerRefusedError('Ledger currency must be a 3-letter ISO code', {
      reason: 'INVALID_CURRENCY',
      currency,
    });
  }
  const seen = new Set<string>();
  return lines.map((line) => {
    if (orderItemIdsWithEarnings.has(line.orderItemId) || seen.has(line.orderItemId)) {
      throw new LedgerRefusedError('This order line already has an earning entry', {
        reason: 'ALREADY_RECORDED',
        orderItemId: line.orderItemId,
      });
    }
    seen.add(line.orderItemId);
    if (line.netTeacherMinor < 0n) {
      throw new LedgerRefusedError('An earning cannot be negative', {
        reason: 'NEGATIVE_EARNING',
        orderItemId: line.orderItemId,
      });
    }
    return {
      teacherId: line.teacherId,
      type: 'EARNING',
      amountMinor: line.netTeacherMinor,
      currency,
      orderItemId: line.orderItemId,
      description: `Sale of "${line.courseTitle}" (order ${paymentReference})`,
    };
  });
}
