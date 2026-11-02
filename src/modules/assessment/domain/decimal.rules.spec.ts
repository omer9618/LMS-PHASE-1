import {
  compareDecimal,
  decimalShape,
  ExactDecimal,
  formatDecimal,
  parseDecimal,
  withinTolerance,
} from './decimal.rules';

const d = (text: string): ExactDecimal => {
  const parsed = parseDecimal(text);
  if (!parsed) throw new Error(`bad decimal ${text}`);
  return parsed;
};

describe('Exact decimals (#70)', () => {
  it('parses plain decimal notation', () => {
    expect(d('12')).toEqual({ digits: 12n, scale: 0 });
    expect(d('-0.5')).toEqual({ digits: -5n, scale: 1 });
    expect(d('+.25')).toEqual({ digits: 25n, scale: 2 });
    expect(d('3.')).toEqual({ digits: 3n, scale: 0 });
    expect(d(' 9.810 ')).toEqual({ digits: 9810n, scale: 3 });
  });

  it('rejects anything that is not plain decimal notation', () => {
    for (const bad of [
      '',
      ' ',
      '.',
      '-',
      '1e3',
      '1,5',
      '0x10',
      'NaN',
      'Infinity',
      '1.2.3',
      '--1',
    ]) {
      expect(parseDecimal(bad)).toBeNull();
    }
    expect(parseDecimal('1'.repeat(41))).toBeNull();
  });

  it('formats canonically, keeping the given scale', () => {
    expect(formatDecimal(d('+007.50'))).toBe('7.50');
    expect(formatDecimal(d('-0.05'))).toBe('-0.05');
    expect(formatDecimal(d('.5'))).toBe('0.5');
    expect(formatDecimal(d('-0'))).toBe('0');
    expect(formatDecimal(d('-0.000'))).toBe('0.000');
  });

  it('reports integer and fraction digit counts', () => {
    expect(decimalShape(d('123.4567'))).toEqual({ integerDigits: 3, fractionDigits: 4 });
    expect(decimalShape(d('0.001'))).toEqual({ integerDigits: 0, fractionDigits: 3 });
  });

  it('compares across scales exactly', () => {
    expect(compareDecimal(d('2.50'), d('2.5'))).toBe(0);
    expect(compareDecimal(d('0.1'), d('0.10000000000000001'))).toBe(-1);
    expect(compareDecimal(d('-1'), d('-1.5'))).toBe(1);
  });

  it('applies the tolerance inclusively at both edges, with no float drift', () => {
    // 0.1 + 0.2 != 0.3 in floating point; here it is exact.
    expect(withinTolerance(d('0.3'), d('0.30000000000000004'), d('0'))).toBe(false);
    expect(withinTolerance(d('0.3'), d('0.3'), d('0'))).toBe(true);
    expect(withinTolerance(d('9.7'), d('9.81'), d('0.11'))).toBe(true);
    expect(withinTolerance(d('9.92'), d('9.81'), d('0.11'))).toBe(true);
    expect(withinTolerance(d('9.69'), d('9.81'), d('0.11'))).toBe(false);
    expect(withinTolerance(d('9.921'), d('9.81'), d('0.11'))).toBe(false);
    expect(withinTolerance(d('-5.05'), d('-5'), d('0.05'))).toBe(true);
    expect(withinTolerance(d('-4.9499999'), d('-5'), d('0.05'))).toBe(false);
  });

  it('never matches with a negative tolerance', () => {
    expect(withinTolerance(d('1'), d('1'), d('-0.1'))).toBe(false);
  });
});
