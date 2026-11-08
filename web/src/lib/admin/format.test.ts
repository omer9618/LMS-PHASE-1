import { describe, expect, it } from 'vitest';
import {
  formatAgeHours,
  formatAgeMinutes,
  formatBps,
  parsePositiveMajorToMinor,
  parseSignedMajorToMinor,
  percentToBps,
  todayIso,
} from './format';

describe('admin format helpers', () => {
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

  it('describes ages for queues and concerns', () => {
    expect(formatAgeHours(0)).toBe('under an hour');
    expect(formatAgeHours(5)).toBe('5 h');
    expect(formatAgeHours(48)).toBe('2 d');
    expect(formatAgeHours(50)).toBe('2 d 2 h');
    expect(formatAgeHours(null)).toBe('—');
    expect(formatAgeMinutes(125)).toBe('2 h');
  });

  it('gives today as a UTC date', () => {
    expect(todayIso(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-08');
  });
});
