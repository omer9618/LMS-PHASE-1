import type { CartQuote } from '../api/orders';
import { formatDateTime, formatElapsed } from '../format';
import { formatMoney } from '../money';
import { ORDER_STATUS_LABELS, statusLabel } from '../status';

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
    .replace(ISO_INSTANT, (iso) => formatDateTime(iso) || iso);
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

/** Bank details that were never filled in still hold the shipped "[to be confirmed]" placeholders. */
export function bankDetailsReady(text: string | null | undefined): boolean {
  return Boolean(text?.trim()) && !/\[to be confirmed\]/i.test(text ?? '');
}

/** The order chip: the shared words, or "Awaiting top-up" while the admin is waiting for the rest. */
export function orderStatusLabel(order: {
  status: string;
  lastDecision?: { kind: string } | null;
}): string {
  if (order.status === 'PENDING' && order.lastDecision?.kind === 'TOP_UP_REQUESTED') {
    return 'Awaiting top-up';
  }
  return statusLabel(order.status, ORDER_STATUS_LABELS);
}

/** "42h 10m left", or "passed". For the payment deadline. */
export function timeUntil(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) - nowMs;
  if (ms <= 0) return 'passed';
  return `${formatElapsed(Math.ceil(ms / 60_000))} left`;
}
