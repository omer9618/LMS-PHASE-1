import { startOfUtcDay, totalAttention } from './dashboard.rules';

describe('dashboard rules (#102)', () => {
  it('today starts at midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-11-03T23:59:59.999Z'))).toEqual(
      new Date('2026-11-03T00:00:00.000Z'),
    );
    expect(startOfUtcDay(new Date('2026-11-03T00:00:00.000Z'))).toEqual(
      new Date('2026-11-03T00:00:00.000Z'),
    );
    expect(startOfUtcDay(new Date('2027-01-01T04:00:00+05:00'))).toEqual(
      new Date('2026-12-31T00:00:00.000Z'),
    );
  });

  it('totals the queues, skipping ones not available yet', () => {
    expect(totalAttention([3, null, 2, 0])).toBe(5);
    expect(totalAttention([null, null])).toBe(0);
  });
});
