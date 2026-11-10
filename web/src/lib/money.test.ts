import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatPrice,
  minorToMajorInput,
  minorUnitExponent,
  parseMajorToMinor,
  splitMinor,
  formatBps,
  parsePositiveMajorToMinor,
  parseSignedMajorToMinor,
  percentToBps,
} from './money';

describe('formatMoney', () => {
  it.each([
    ['0', 'PKR', 'PKR 0.00'],
    ['5', 'PKR', 'PKR 0.05'],
    ['99', 'PKR', 'PKR 0.99'],
    ['100', 'PKR', 'PKR 1.00'],
    ['150000', 'PKR', 'PKR 1,500.00'],
    ['150050', 'pkr', 'PKR 1,500.50'],
    ['123456789', 'GBP', 'GBP 1,234,567.89'],
    ['-2500', 'USD', 'USD -25.00'],
    ['1500', 'JPY', 'JPY 1,500'],
    ['1500', 'KWD', 'KWD 1.500'],
    ['000150', 'PKR', 'PKR 1.50'],
  ])('%s %s → %s', (minor, currency, expected) => {
    expect(formatMoney(minor, currency)).toBe(expected);
  });

  it('is exact beyond Number.MAX_SAFE_INTEGER', () => {
    // 2^53 + 1 cannot be represented as a float; string maths keeps every digit.
    expect(formatMoney('9007199254740993', 'PKR')).toBe('PKR 90,071,992,547,409.93');
    expect(formatMoney('999999999999999999', 'PKR')).toBe('PKR 9,999,999,999,999,999.99');
  });

  it('omits the code when there is no currency', () => {
    expect(formatMoney('150000', null)).toBe('1,500.00');
  });

  it('never shows negative zero', () => {
    expect(formatMoney('-0', 'PKR')).toBe('PKR 0.00');
  });

  it('rejects anything that is not whole minor units', () => {
    expect(() => formatMoney('15.00', 'PKR')).toThrow(TypeError);
    expect(() => formatMoney('1e5', 'PKR')).toThrow(TypeError);
    expect(() => formatMoney('', 'PKR')).toThrow(TypeError);
  });
});

describe('splitMinor', () => {
  it('splits into grouped major and fraction', () => {
    expect(splitMinor('150050', 2)).toEqual({ negative: false, major: '1,500', fraction: '50' });
    expect(splitMinor('7', 3)).toEqual({ negative: false, major: '0', fraction: '007' });
  });
});

describe('minorUnitExponent', () => {
  it('defaults to 2 and knows the exceptions', () => {
    expect(minorUnitExponent('PKR')).toBe(2);
    expect(minorUnitExponent(null)).toBe(2);
    expect(minorUnitExponent('jpy')).toBe(0);
    expect(minorUnitExponent('OMR')).toBe(3);
  });
});

describe('formatPrice', () => {
  it('shows Free for free courses and the amount otherwise', () => {
    expect(formatPrice({ isFree: true, priceMinor: null, currency: null })).toBe('Free');
    expect(formatPrice({ isFree: false, priceMinor: '250000', currency: 'PKR' })).toBe(
      'PKR 2,500.00',
    );
    expect(formatPrice({ isFree: false, priceMinor: null, currency: 'PKR' })).toBe('Price not set');
  });
});

describe('parseMajorToMinor', () => {
  it.each([
    ['1500', '150000'],
    ['1,500', '150000'],
    [' 1500.5 ', '150050'],
    ['1500.55', '150055'],
    ['0.01', '1'],
    ['0', '0'],
    ['12.', '1200'],
    ['90071992547409.93', '9007199254740993'],
  ])('%s → %s', (input, expected) => {
    expect(parseMajorToMinor(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1e3', '.5', '1.2.3'])('rejects %j', (input) => {
    expect(parseMajorToMinor(input)).toBeNull();
  });

  it('respects the exponent', () => {
    expect(parseMajorToMinor('1500', 0)).toBe('1500');
    expect(parseMajorToMinor('1.5', 0)).toBeNull();
    expect(parseMajorToMinor('1.5', 3)).toBe('1500');
  });
});

describe('minorToMajorInput', () => {
  it('round-trips with parseMajorToMinor', () => {
    expect(minorToMajorInput('150000')).toBe('1500');
    expect(minorToMajorInput('150050')).toBe('1500.5');
    expect(minorToMajorInput('1')).toBe('0.01');
    for (const minor of ['0', '1', '99', '150050', '9007199254740993']) {
      expect(parseMajorToMinor(minorToMajorInput(minor))).toBe(minor);
    }
  });
});

describe('admin amount helpers', () => {
  it('converts a commission percentage to basis points without floats', () => {
    expect(percentToBps('20')).toBe(2000);
    expect(percentToBps('12.5')).toBe(1250);
    expect(percentToBps('0.01')).toBe(1);
    expect(percentToBps('100')).toBe(10000);
    expect(percentToBps('100.01')).toBeNull();
    expect(percentToBps('1.234')).toBeNull();
    expect(percentToBps('-5')).toBeNull();
    expect(percentToBps('abc')).toBeNull();
  });

  it('formats basis points as a percentage', () => {
    expect(formatBps(2000)).toBe('20%');
    expect(formatBps(1250)).toBe('12.5%');
    expect(formatBps(5)).toBe('0.05%');
    expect(formatBps(null)).toBe('—');
  });

  it('parses signed and positive amounts in the currency exponent, refusing zero', () => {
    expect(parseSignedMajorToMinor('-1500', 'PKR')).toBe('-150000');
    expect(parseSignedMajorToMinor('250.5', 'PKR')).toBe('25050');
    expect(parseSignedMajorToMinor('0', 'PKR')).toBeNull();
    expect(parseSignedMajorToMinor('-0.00', 'PKR')).toBeNull();
    expect(parseSignedMajorToMinor('1.5', 'JPY')).toBeNull();
    expect(parsePositiveMajorToMinor('1,500.25', 'PKR')).toBe('150025');
    expect(parsePositiveMajorToMinor('-1', 'PKR')).toBeNull();
    expect(parsePositiveMajorToMinor('0', 'PKR')).toBeNull();
    expect(parsePositiveMajorToMinor('12345678901234567.89', 'PKR')).toBe('1234567890123456789');
  });
});
