import type { MismatchAction } from '@/lib/api/admin-money';

/**
 * #64, #66 on the screen: comparing what arrived in the bank with the order total, and which
 * mismatch actions the API accepts. BigInt keeps the comparison exact (never a float); amounts
 * stay strings of minor units in and out.
 */
export interface AmountCheck {
  kind: 'exact' | 'short' | 'over';
  /** received - total, minor units. */
  differenceMinor: string;
  /** What the admin may choose; empty when the amount matches. */
  actions: MismatchAction[];
}

export function checkReceived(totalMinor: string, receivedMinor: string): AmountCheck {
  const difference = BigInt(receivedMinor) - BigInt(totalMinor);
  if (difference === 0n) return { kind: 'exact', differenceMinor: '0', actions: [] };
  if (difference < 0n) {
    return {
      kind: 'short',
      differenceMinor: difference.toString(),
      actions: ['REQUEST_TOP_UP', 'CONFIRM_ANYWAY', 'REJECT'],
    };
  }
  return {
    kind: 'over',
    differenceMinor: difference.toString(),
    actions: ['CONFIRM_ANYWAY', 'REJECT'],
  };
}

export const MISMATCH_LABELS: Record<MismatchAction, string> = {
  CONFIRM_ANYWAY: 'Confirm anyway (grant access)',
  REQUEST_TOP_UP: 'Ask the student to pay the rest',
  REJECT: 'Reject the payment',
};

/** "-150000" → "150000": the size of a difference, for formatting with its sign said in words. */
export function absMinor(minor: string): string {
  return minor.startsWith('-') ? minor.slice(1) : minor;
}
