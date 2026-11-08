import type { BadgeTone } from '@/components/ui';
import type { CartQuote, OrderStatus } from './api/orders';
import { formatMoney, minorUnitExponent, parseMajorToMinor } from './money';

const MINOR_AMOUNT = /\b([A-Z]{3}) (-?\d+) \(minor units\)/g;
const ISO_INSTANT = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;

/**
 * The API's `guidance.whatHappensNext` quotes amounts in minor units ("PKR 1500000 (minor
 * units)") and deadlines as ISO instants. Shown as is, both confuse students, so they are
 * reformatted here: "PKR 15,000.00", "3 Nov 2026, 14:05 GMT+5". Everything else is unchanged.
 */
export function humaniseGuidance(text: string): string {
  return text
    .replace(MINOR_AMOUNT, (_, currency: string, minor: string) => formatMoney(minor, currency))
    .replace(ISO_INSTANT, (iso) => formatDateTime(iso) ?? iso);
}

/** Pure helpers for the purchase screens (#54–#62). Money stays in string minor units. */

export interface TeacherGroup {
  teacherId: string;
  teacherName: string;
  items: CartQuote['items'];
  /** Minor units, summed exactly with BigInt (never Number). */
  subtotalMinor: string;
}

/** Cart lines grouped per teacher, in first-seen order, with exact subtotals. */
export function groupByTeacher(items: CartQuote['items']): TeacherGroup[] {
  const groups = new Map<string, TeacherGroup>();
  for (const item of items) {
    const group = groups.get(item.teacherId) ?? {
      teacherId: item.teacherId,
      teacherName: item.teacherName ?? 'Teacher',
      items: [],
      subtotalMinor: '0',
    };
    group.items.push(item);
    group.subtotalMinor = (BigInt(group.subtotalMinor) + BigInt(item.priceMinor)).toString();
    groups.set(item.teacherId, group);
  }
  return [...groups.values()];
}

export const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  PENDING: 'warning',
  PROOF_SUBMITTED: 'info',
  VERIFIED: 'success',
  REJECTED: 'danger',
  LAPSED: 'neutral',
  REFUNDED: 'neutral',
};

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** "3 Nov 2026, 14:05 GMT+5" in the viewer's time zone. */
export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : DATE_TIME.format(date);
}

/** "in 1 day 3 h", "in 45 min", or "passed". For the payment deadline. */
export function timeUntil(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) - nowMs;
  if (ms <= 0) return 'passed';
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  if (hours > 0) return `in ${hours} h${mins ? ` ${mins} min` : ''}`;
  return `in ${mins} min`;
}

export interface ProofFormValues {
  transactionId: string;
  amount: string;
}

export type ProofFormResult =
  | { ok: true; transactionId: string; amountClaimedMinor?: string }
  | { ok: false; errors: Partial<Record<keyof ProofFormValues, string>> };

/** Mirrors the API's proof rules (#58) for instant feedback; the API stays the authority. */
export function validateProofForm(values: ProofFormValues, currency: string): ProofFormResult {
  const errors: Partial<Record<keyof ProofFormValues, string>> = {};
  const transactionId = values.transactionId.trim();
  if (transactionId.length < 2) errors.transactionId = 'Enter the transaction ID from your bank';
  else if (transactionId.length > 120) errors.transactionId = 'At most 120 characters';

  let amountClaimedMinor: string | undefined;
  if (values.amount.trim()) {
    const minor = parseMajorToMinor(values.amount, minorUnitExponent(currency));
    if (minor === null || /^0+$/.test(minor)) {
      errors.amount = 'Enter the amount you transferred, such as 15000 or 15,000.50';
    } else {
      amountClaimedMinor = minor;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return amountClaimedMinor
    ? { ok: true, transactionId, amountClaimedMinor }
    : { ok: true, transactionId };
}
