import { describe, expect, it } from 'vitest';
import { formatDuration, safeNextPath } from './format';

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
