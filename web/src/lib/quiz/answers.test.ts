import { describe, expect, it } from 'vitest';
import { isPlainDecimal, revealExplanation } from './answers';

describe('quiz answers', () => {
  it('accepts the plain decimals the API accepts', () => {
    for (const ok of ['9.81', '-0.5', '+3', '.5', '3.', ' 12 '])
      expect(isPlainDecimal(ok)).toBe(true);
  });

  it('refuses units, commas, exponents and junk', () => {
    for (const bad of ['', '9.8 m/s', '1,5', '1e3', '--1', '.', 'abc', '1'.repeat(41)]) {
      expect(isPlainDecimal(bad)).toBe(false);
    }
  });

  it('explains each reveal setting', () => {
    expect(revealExplanation('NEVER')).toMatch(/not to show/);
    expect(revealExplanation('AFTER_PASS')).toMatch(/pass/);
    expect(revealExplanation('AFTER_FINAL_ATTEMPT')).toMatch(/final attempt/);
  });
});
