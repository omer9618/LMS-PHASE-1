/**
 * Admin dashboard rules (#102). Pure.
 */

/**
 * Start of "today" for the dashboard's daily counts: midnight UTC, the platform's time zone for
 * stored timestamps. A local business day (e.g. Pakistan, UTC+5) is an open question on #102.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The sum of the queues that need an admin, ignoring ones not available yet (null). */
export function totalAttention(counts: Array<number | null>): number {
  return counts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}
