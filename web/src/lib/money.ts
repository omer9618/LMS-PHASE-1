/**
 * Money is a string of minor units end to end (`"150000"` = 1,500.00). Everything here is string
 * arithmetic: a value is never turned into a float or a Number, so no amount can lose precision.
 */

/** ISO 4217 minor-unit exponents that are not 2. Anything unlisted (PKR, GBP, USD, ...) uses 2. */
const EXPONENTS: Record<string, number> = {
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  UGX: 0,
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
