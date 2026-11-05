/**
 * Exact decimal arithmetic for numeric questions (#70). Pure.
 *
 * A decimal is held as an integer of digits plus a scale (`digits / 10^scale`), both exact:
 * "0.1" is { digits: 1n, scale: 1 }. Comparisons align scales with BigInt multiplication,
 * so there is no floating-point drift ("0.1 + 0.2" problems cannot happen).
 */
export interface ExactDecimal {
  readonly digits: bigint;
  readonly scale: number;
}

/** Plain decimal notation: optional sign, digits, optional fraction. No exponents, no commas. */
const DECIMAL_PATTERN = /^([+-])?(\d*)(?:\.(\d*))?$/;

/** Longest decimal string accepted anywhere (answers included). */
export const MAX_DECIMAL_LENGTH = 40;

/** Parses plain decimal notation ("12", "-0.5", ".25", "3."). Returns null for anything else. */
export function parseDecimal(input: string): ExactDecimal | null {
  const text = input.trim();
  if (text.length === 0 || text.length > MAX_DECIMAL_LENGTH) return null;
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) return null;
  const [, sign, whole = '', fraction = ''] = match;
  if (whole.length === 0 && fraction.length === 0) return null;
  const magnitude = BigInt(`${whole}${fraction}` || '0');
  return { digits: sign === '-' ? -magnitude : magnitude, scale: fraction.length };
}

/** Canonical text: no "+", no redundant leading zeros, the fraction kept as given ("2.50"). */
export function formatDecimal(value: ExactDecimal): string {
  const negative = value.digits < 0n;
  const raw = (negative ? -value.digits : value.digits).toString().padStart(value.scale + 1, '0');
  const whole = raw.slice(0, raw.length - value.scale);
  const fraction = raw.slice(raw.length - value.scale);
  const body = value.scale > 0 ? `${whole}.${fraction}` : whole;
  return negative && value.digits !== 0n ? `-${body}` : body;
}

/** Integer and fraction digit counts, for storage limits. */
export function decimalShape(value: ExactDecimal): {
  integerDigits: number;
  fractionDigits: number;
} {
  const abs = value.digits < 0n ? -value.digits : value.digits;
  const totalDigits = abs.toString().length;
  return {
    integerDigits: Math.max(totalDigits - value.scale, 0),
    fractionDigits: value.scale,
  };
}

function rescale(value: ExactDecimal, scale: number): bigint {
  return value.digits * 10n ** BigInt(scale - value.scale);
}

/** -1, 0 or 1. */
export function compareDecimal(a: ExactDecimal, b: ExactDecimal): number {
  const scale = Math.max(a.scale, b.scale);
  const x = rescale(a, scale);
  const y = rescale(b, scale);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** |answer - target| <= tolerance, exactly. A negative tolerance never matches. */
export function withinTolerance(
  answer: ExactDecimal,
  target: ExactDecimal,
  tolerance: ExactDecimal,
): boolean {
  const scale = Math.max(answer.scale, target.scale, tolerance.scale);
  const difference = rescale(answer, scale) - rescale(target, scale);
  const distance = difference < 0n ? -difference : difference;
  return distance <= rescale(tolerance, scale);
}
