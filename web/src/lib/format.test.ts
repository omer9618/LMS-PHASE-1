import { describe, expect, it } from 'vitest';
import {
  formatAgeHours,
  formatAgeMinutes,
  formatDuration,
  formatElapsed,
  formatPeriod,
  safeNextPath,
  todayIso,
} from './format';

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

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'courses',
    // Browsers delete tabs and newlines inside a URL, so these would become "//evil.example".
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/ /evil.example',
    '/\u0000/evil.example',
    '/\u007f/evil.example',
    '/foo\\bar',
  ])('falls back for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/courses');
  });

  it('keeps a path with an encoded query as given, and honours a custom fallback', () => {
    expect(safeNextPath('/search?q=a%20b#top')).toBe('/search?q=a%20b#top');
    expect(safeNextPath('https://evil.example', '/dashboard')).toBe('/dashboard');
  });
});

describe('ages and dates', () => {
  it('describes ages for queues and concerns', () => {
    expect(formatAgeHours(0)).toBe('<1h');
    expect(formatAgeHours(5)).toBe('5h');
    expect(formatAgeHours(48)).toBe('48h');
    expect(formatAgeHours(72)).toBe('3d');
    expect(formatAgeHours(75)).toBe('3d 3h');
    expect(formatAgeHours(null)).toBe('—');
    expect(formatAgeMinutes(125)).toBe('2h 05m');
  });

  it('writes every wait the same way', () => {
    expect(formatElapsed(12)).toBe('0h 12m');
    expect(formatElapsed(3070)).toBe('51h 10m');
    expect(formatElapsed(4779 * 60 + 10)).toBe('199d 3h');
    expect(formatElapsed(null)).toBe('—');
  });

  it('writes a payout period as one range', () => {
    expect(formatPeriod('2026-10-01', '2026-10-31')).toBe('1–31 Oct 2026');
    expect(formatPeriod('2026-10-28', '2026-11-03')).toBe('28 Oct – 3 Nov 2026');
    expect(formatPeriod('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('gives today as a UTC date', () => {
    expect(todayIso(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-08');
  });
});
