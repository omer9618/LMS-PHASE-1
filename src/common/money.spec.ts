import { currencyExponent, formatAmount } from './money';

describe('formatAmount (#112)', () => {
  it('uses the currency decimals', () => {
    expect(formatAmount(150000n, 'PKR')).toBe('PKR 1,500.00');
    expect(formatAmount(5n, 'USD')).toBe('USD 0.05');
    expect(formatAmount(1500n, 'JPY')).toBe('JPY 1,500');
    expect(formatAmount(-250n, 'GBP')).toBe('-GBP 2.50');
    expect(formatAmount(1234567n, 'KWD')).toBe('KWD 1,234.567');
  });
});

describe('currencyExponent', () => {
  it('is 2 unless ISO 4217 says otherwise', () => {
    expect(currencyExponent('PKR')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });

  it('formats payout amounts in zero and three decimal currencies (was always 2)', () => {
    expect(formatAmount(160050n, 'PKR')).toBe('PKR 1,600.50');
    expect(formatAmount(160050n, 'JPY')).toBe('JPY 160,050');
    expect(formatAmount(160050n, 'KWD')).toBe('KWD 160.050');
  });
});

describe('web and API agree on minor-unit exponents', () => {
  it('gives every possible 3-letter code the same exponent in both', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const web = require('../../web/src/lib/money') as {
      minorUnitExponent: (currency: string) => number;
    };
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const mismatches: string[] = [];
    for (const a of letters)
      for (const b of letters)
        for (const c of letters) {
          const code = `${a}${b}${c}`;
          if (web.minorUnitExponent(code) !== currencyExponent(code)) mismatches.push(code);
        }
    expect(mismatches).toEqual([]);
  });
});
