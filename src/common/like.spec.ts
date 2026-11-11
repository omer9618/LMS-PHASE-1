import { containsText, escapeLike } from './like';

describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c:\\x')).toBe('c:\\\\x');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('physics 0625')).toBe('physics 0625');
  });
});

describe('containsText', () => {
  it('builds a case-insensitive contains filter on the escaped text', () => {
    expect(containsText('%_%')).toEqual({ contains: '\\%\\_\\%', mode: 'insensitive' });
  });
});
