import { describe, expect, it } from 'vitest';
import { splitMath } from './math-text';

describe('splitMath', () => {
  it('keeps plain text as one segment', () => {
    expect(splitMath('No maths here.')).toEqual([{ kind: 'text', value: 'No maths here.' }]);
    expect(splitMath('')).toEqual([]);
  });

  it('finds inline and display math', () => {
    expect(splitMath('Solve $x^2 = 4$ then $$\\int_0^1 x\\,dx$$ done')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', value: 'x^2 = 4', display: false },
      { kind: 'text', value: ' then ' },
      { kind: 'math', value: '\\int_0^1 x\\,dx', display: true },
      { kind: 'text', value: ' done' },
    ]);
  });

  it('treats \\$ as a literal dollar, inside and outside math', () => {
    expect(splitMath('Costs \\$5 and $\\$x$')).toEqual([
      { kind: 'text', value: 'Costs $5 and ' },
      { kind: 'math', value: '\\$x', display: false },
    ]);
  });

  it('leaves unclosed or empty delimiters as text', () => {
    expect(splitMath('Price $5 only')).toEqual([{ kind: 'text', value: 'Price $5 only' }]);
    expect(splitMath('$$ $$ and $$x')).toEqual([{ kind: 'text', value: '$$ $$ and $$x' }]);
  });

  it('handles chemistry notation as math', () => {
    expect(splitMath('$\\ce{H2O}$')).toEqual([
      { kind: 'math', value: '\\ce{H2O}', display: false },
    ]);
  });
});
