import { minorUnitExponent, parseMajorToMinor } from '@/lib/money';

/**
 * Admin input and display helpers. Pure; money stays string arithmetic (never a float).
 */

/** "20" → 2000, "12.5" → 1250, "0.01" → 1; null if not a percentage 0–100 with ≤ 2 decimals. */
export function percentToBps(input: string): number | null {
  const minor = parseMajorToMinor(input, 2);
  if (minor === null) return null;
  const bps = Number(minor);
  return Number.isSafeInteger(bps) && bps <= 10_000 ? bps : null;
}

/** 2000 → "20%", 1250 → "12.5%". */
export function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}%`;
}

/**
 * A signed amount typed by an admin ("-1500", "250.5") → signed minor units, or null. Zero is
 * refused: an adjustment of nothing is a mistake.
 */
export function parseSignedMajorToMinor(input: string, currency: string): string | null {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-');
  const minor = parseMajorToMinor(
    negative ? trimmed.slice(1) : trimmed,
    minorUnitExponent(currency),
  );
  if (minor === null || /^0+$/.test(minor)) return null;
  return negative ? `-${minor}` : minor;
}

/** A positive amount typed by an admin → minor units, or null (zero refused). */
export function parsePositiveMajorToMinor(input: string, currency: string): string | null {
  const minor = parseMajorToMinor(input, minorUnitExponent(currency));
  if (minor === null || /^0+$/.test(minor)) return null;
  return minor;
}

/** 0 → "under an hour", 5 → "5 h", 50 → "2 d 2 h". For queue and concern ageing. */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return 'under an hour';
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return `${hours} h`;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

/** Minutes waiting → the same wording as formatAgeHours. */
export function formatAgeMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return formatAgeHours(Math.floor(minutes / 60));
}

/** Today's date as YYYY-MM-DD in UTC (bank value dates and transfer dates). */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
