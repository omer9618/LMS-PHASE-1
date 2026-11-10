import { describe, expect, it } from 'vitest';
import { formatAgeHours, formatAgeMinutes, formatDuration, safeNextPath, todayIso } from './format';

describe('formatDuration', () => {
  it.each([
    [null, null],
    [0, null],
    [20, '1 min'],
    [75, '1 min'],
    [600, '10 min'],
    [3600, '1 h'],
    [3725, '1 h 2 min'],
  ])('%s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('safeNextPath', () => {
  it('accepts same-site paths', () => {
    expect(safeNextPath('/courses/abc?x=1')).toBe('/courses/abc?x=1');
  });

  it.each([null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'courses'])(
    'falls back for %j',
    (raw) => {
      expect(safeNextPath(raw)).toBe('/courses');
    },
  );
});

describe('ages and dates', () => {
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
