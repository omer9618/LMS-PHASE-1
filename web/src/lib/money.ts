/**
 * Money is a string of minor units end to end (`"150000"` = 1,500.00). Everything here is string
 * arithmetic: a value is never turned into a float or a Number, so no amount can lose precision.
 */

/**
 * ISO 4217 minor-unit exponents that are not 2. Anything unlisted (PKR, GBP, USD, ...) uses 2.
 * Must match `src/common/money.ts` (the API); `money.spec.ts` there compares the two.
 */
const EXPONENTS: Record<string, number> = {
  ...Object.fromEntries(
    [
      'BIF',
      'CLP',
      'DJF',
      'GNF',
      'ISK',
      'JPY',
      'KMF',
      'KRW',
      'PYG',
      'RWF',
      'UGX',
      'UYI',
      'VND',
      'VUV',
      'XAF',
      'XOF',
      'XPF',
    ].map((c) => [c, 0]),
  ),
  ...Object.fromEntries(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'].map((c) => [c, 3])),
};

/** Fallback when a price has no currency (Phase 1 sells in one currency: open question #127). */
export const DEFAULT_EXPONENT = 2;

const MINOR_PATTERN = /^-?\d+$/;

export function minorUnitExponent(currency: string | null | undefined): number {
  if (!currency) return DEFAULT_EXPONENT;
  return EXPONENTS[currency.toUpperCase()] ?? DEFAULT_EXPONENT;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Splits minor units into grouped major digits and the fraction, e.g. "150050" (exp 2) →
 * { negative: false, major: "1,500", fraction: "50" }.
 */
export function splitMinor(
  minor: string,
  exponent: number,
): { negative: boolean; major: string; fraction: string } {
  if (!MINOR_PATTERN.test(minor)) throw new TypeError(`Not an amount in minor units: "${minor}"`);
  const negative = minor.startsWith('-');
  const digits = (negative ? minor.slice(1) : minor).replace(/^0+(?=\d)/, '');
  const padded = digits.padStart(exponent + 1, '0');
  const major = padded.slice(0, padded.length - exponent);
  const fraction = exponent > 0 ? padded.slice(padded.length - exponent) : '';
  const isZero = /^0+$/.test(digits);
  return { negative: negative && !isZero, major: groupThousands(major), fraction };
}

/**
 * "150000", "PKR" → "PKR 1,500.00". The currency code leads so the format is the same for every
 * currency and locale-independent (server and browser render identical text).
 */
export function formatMoney(minor: string, currency: string | null | undefined): string {
  const { negative, major, fraction } = splitMinor(minor, minorUnitExponent(currency));
  const amount = `${negative ? '-' : ''}${major}${fraction ? `.${fraction}` : ''}`;
  return currency ? `${currency.toUpperCase()} ${amount}` : amount;
}

/** A course's price as shown in the catalogue: "Free" or the formatted amount. */
export function formatPrice(course: {
  isFree: boolean;
  priceMinor: string | null;
  currency: string | null;
}): string {
  if (course.isFree) return 'Free';
  if (course.priceMinor === null) return 'Price not set';
  return formatMoney(course.priceMinor, course.currency);
}

/**
 * What a person types ("1500", "1,500.5") → minor units ("150050"), or null when it is not a
 * non-negative amount with at most `exponent` decimals.
 */
export function parseMajorToMinor(input: string, exponent = DEFAULT_EXPONENT): string | null {
  const cleaned = input.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) return null;
  const minor = `${whole}${fraction.padEnd(exponent, '0')}`.replace(/^0+(?=\d)/, '');
  return minor;
}

/** Minor units → what goes back into an input ("150050" → "1500.5", "150000" → "1500"). */
export function minorToMajorInput(minor: string, exponent = DEFAULT_EXPONENT): string {
  const { negative, major, fraction } = splitMinor(minor, exponent);
  const trimmed = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${major.replace(/,/g, '')}${trimmed ? `.${trimmed}` : ''}`;
}

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
