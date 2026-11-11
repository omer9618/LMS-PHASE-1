import { describe, expect, it } from 'vitest';
import {
  clockOffsetMs,
  describeTimeLimit,
  formatCountdown,
  isRunningLow,
  remainingMs,
} from './timer';

describe('quiz timer', () => {
  it('counts from the server clock, not the device clock', () => {
    // The device is 5 minutes fast.
    const deviceNow = Date.parse('2026-11-03T10:05:00Z');
    const offset = clockOffsetMs('2026-11-03T10:00:00Z', deviceNow);
    expect(offset).toBe(-300_000);
    expect(remainingMs('2026-11-03T10:10:00Z', offset, deviceNow)).toBe(600_000);
    expect(remainingMs('2026-11-03T10:10:00Z', offset, deviceNow + 30_000)).toBe(570_000);
  });

  it('never goes negative and is null when untimed', () => {
    expect(remainingMs('2026-11-03T10:00:00Z', 0, Date.parse('2026-11-03T11:00:00Z'))).toBe(0);
    expect(remainingMs(null, 0, 0)).toBeNull();
  });

  it('formats the countdown, rounding up', () => {
    expect(formatCountdown(754_000)).toBe('12:34');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(500)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('describes time limits', () => {
    expect(describeTimeLimit(null)).toBe('No time limit');
    expect(describeTimeLimit(600)).toBe('10 minutes');
    expect(describeTimeLimit(60)).toBe('1 minute');
    expect(describeTimeLimit(90)).toBe('1 min 30 s');
    expect(describeTimeLimit(45)).toBe('45 seconds');
  });

  it('warns when time is running low', () => {
    expect(isRunningLow(59_000, 600)).toBe(true);
    expect(isRunningLow(61_000, 600)).toBe(false);
    expect(isRunningLow(300_000, 3600)).toBe(true); // 10% of an hour is 6 minutes
    expect(isRunningLow(0, null)).toBe(false);
  });
});
