import { describe, expect, it } from 'vitest';
import { absMinor, checkReceived } from './verification';

describe('checkReceived (#64, #66)', () => {
  it('an exact amount needs no mismatch action', () => {
    expect(checkReceived('150000', '150000')).toEqual({
      kind: 'exact',
      differenceMinor: '0',
      actions: [],
    });
  });

  it('a short payment can be topped up, confirmed anyway or rejected', () => {
    expect(checkReceived('150000', '100000')).toEqual({
      kind: 'short',
      differenceMinor: '-50000',
      actions: ['REQUEST_TOP_UP', 'CONFIRM_ANYWAY', 'REJECT'],
    });
  });

  it('an overpayment cannot be topped up', () => {
    expect(checkReceived('150000', '150001')).toEqual({
      kind: 'over',
      differenceMinor: '1',
      actions: ['CONFIRM_ANYWAY', 'REJECT'],
    });
  });

  it('stays exact beyond the float range', () => {
    expect(checkReceived('900719925474099100', '900719925474099101').differenceMinor).toBe('1');
  });

  it('absMinor drops the sign', () => {
    expect(absMinor('-50000')).toBe('50000');
    expect(absMinor('7')).toBe('7');
  });
});
