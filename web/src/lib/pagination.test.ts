import { describe, expect, it } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the first and last page and the neighbours, with gaps between', () => {
    expect(pageWindow(20, 42)).toEqual([1, 'gap', 19, 20, 21, 'gap', 42]);
  });

  it('does not put a gap where only one page is skipped', () => {
    expect(pageWindow(4, 42)).toEqual([1, 2, 3, 4, 5, 'gap', 42]);
    expect(pageWindow(39, 42)).toEqual([1, 'gap', 38, 39, 40, 41, 42]);
  });

  it('handles the ends and clamps a page outside the range', () => {
    expect(pageWindow(1, 42)).toEqual([1, 2, 'gap', 42]);
    expect(pageWindow(42, 42)).toEqual([1, 'gap', 41, 42]);
    expect(pageWindow(99, 42)).toEqual([1, 'gap', 41, 42]);
    expect(pageWindow(0, 42)).toEqual([1, 2, 'gap', 42]);
  });

  it('shows more neighbours when asked', () => {
    expect(pageWindow(10, 20, 2)).toEqual([1, 'gap', 8, 9, 10, 11, 12, 'gap', 20]);
  });
});
