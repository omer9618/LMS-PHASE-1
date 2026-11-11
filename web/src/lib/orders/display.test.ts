import { describe, expect, it } from 'vitest';
import { addToCart, CART_MAX_ITEMS, parseCart, removeFromCart } from './cart';
import { validateProofForm } from '../forms/orders';
import { groupByTeacher, humaniseGuidance, timeUntil } from './display';

describe('humaniseGuidance', () => {
  it('reformats minor units and ISO instants in the API guidance', () => {
    const text = humaniseGuidance(
      'Transfer PKR 1500050 (minor units) using reference LMS-1 by 2026-11-05T09:00:00.000Z, then submit.',
    );
    expect(text).toContain('PKR 15,000.50');
    expect(text).not.toContain('minor units');
    expect(text).not.toContain('2026-11-05T09');
    expect(text).toMatch(/2026/);
    expect(humaniseGuidance('Your payment is confirmed.')).toBe('Your payment is confirmed.');
  });
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('cart', () => {
  it('parses stored carts defensively', () => {
    expect(parseCart(null)).toEqual([]);
    expect(parseCart('nope')).toEqual([]);
    expect(parseCart('{"a":1}')).toEqual([]);
    expect(parseCart(JSON.stringify([id(1), id(1), 'bad', 3, id(2)]))).toEqual([id(1), id(2)]);
  });

  it('adds once, caps the size, and removes', () => {
    expect(addToCart([id(1)], id(1))).toEqual({ ok: true, ids: [id(1)] });
    expect(addToCart([id(1)], id(2))).toEqual({ ok: true, ids: [id(1), id(2)] });
    const full = Array.from({ length: CART_MAX_ITEMS }, (_, i) => id(i));
    expect(addToCart(full, id(99))).toEqual({ ok: false, reason: 'FULL' });
    expect(removeFromCart([id(1), id(2)], id(1))).toEqual([id(2)]);
  });
});

describe('order display', () => {
  it('groups lines per teacher with exact subtotals', () => {
    const line = (courseId: string, teacherId: string, priceMinor: string) => ({
      courseId,
      title: courseId,
      teacherId,
      teacherName: teacherId === 't1' ? 'Ms A' : null,
      priceMinor,
      currency: 'PKR',
    });
    const groups = groupByTeacher([
      line('a', 't1', '999999999999999999'),
      line('b', 't2', '100'),
      line('c', 't1', '1'),
    ]);
    expect(groups.map((g) => [g.teacherName, g.items.length, g.subtotalMinor])).toEqual([
      ['Ms A', 2, '1000000000000000000'],
      ['Teacher', 1, '100'],
    ]);
  });

  it('describes the time to a deadline', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    expect(timeUntil('2026-11-04T13:30:00Z', now)).toBe('in 1 day 3 h');
    expect(timeUntil('2026-11-03T12:15:00Z', now)).toBe('in 2 h 15 min');
    expect(timeUntil('2026-11-03T10:45:00Z', now)).toBe('in 45 min');
    expect(timeUntil('2026-11-03T09:00:00Z', now)).toBe('passed');
  });

  it('validates proof fields and converts the amount to minor units', () => {
    expect(validateProofForm({ transactionId: ' TX-123 ', amount: '' }, 'PKR')).toEqual({
      ok: true,
      transactionId: 'TX-123',
    });
    expect(validateProofForm({ transactionId: 'TX', amount: '15,000.5' }, 'PKR')).toEqual({
      ok: true,
      transactionId: 'TX',
      amountClaimedMinor: '1500050',
    });
    const bad = validateProofForm({ transactionId: 'x', amount: '0' }, 'PKR');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['amount', 'transactionId']);
    expect(validateProofForm({ transactionId: 'TX1', amount: '1.234' }, 'PKR').ok).toBe(false);
  });
});
