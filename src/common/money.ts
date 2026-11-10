// Money formatting shared by every module that writes an amount in an email or message.

/** ISO 4217 minor-unit exponents that are not 2. Explicit, so ICU versions cannot change it. */
const ZERO_DECIMAL_CURRENCIES = new Set([
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
]);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Decimal places of a currency's minor unit (ISO 4217); 2 unless listed above. */
export function currencyExponent(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return 2;
}

/** #112: amounts in emails. "PKR 1,500.00" from minor units, in the currency's ISO 4217 decimals. */
export function formatAmount(minor: bigint, currency: string): string {
  const digits = currencyExponent(currency);
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, '0');
  const major = abs.slice(0, abs.length - digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = digits > 0 ? `.${abs.slice(abs.length - digits)}` : '';
  // Same shape as the web's formatMoney: the sign sits on the number, "PKR -1,500.00".
  return `${currency} ${negative ? '-' : ''}${major}${fraction}`;
}
