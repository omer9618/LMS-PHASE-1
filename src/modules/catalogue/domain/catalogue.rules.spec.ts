import { describePriceFilter, ORDERING_STATEMENTS, sortKeys } from './catalogue.rules';

describe('catalogue rules', () => {
  it('defaults to newest published first and states it (#44)', () => {
    expect(sortKeys('newest')).toEqual([{ field: 'publishedAt', direction: 'desc' }]);
    expect(ORDERING_STATEMENTS.newest).toMatch(/No course can pay/);
  });

  it.each([
    [{}, { kind: 'any' }],
    [{ free: true }, { kind: 'freeOnly' }],
    [{ free: true, minPriceMinor: 100n }, { kind: 'freeOnly' }],
    [{ free: false }, { kind: 'paidRange' }],
    [{ minPriceMinor: 100n }, { kind: 'paidRange', min: 100n, max: undefined }],
    [
      { minPriceMinor: 100n, maxPriceMinor: 500n },
      { kind: 'paidRange', min: 100n, max: 500n },
    ],
    [{ minPriceMinor: 500n, maxPriceMinor: 100n }, { kind: 'none' }],
  ])('price filter %p -> %p (#42)', (filter, expected) => {
    expect(describePriceFilter(filter)).toEqual(expected);
  });
});
