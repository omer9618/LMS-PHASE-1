import { displayText } from './schemas';

// Built from code points so no invisible or direction-control character sits in this file.
const ch = (codePoint: number) => String.fromCodePoint(codePoint);
const ZWNJ = ch(0x200c);
const ZWSP = ch(0x200b);
const WORD_JOINER = ch(0x2060);
const SOFT_HYPHEN = ch(0x00ad);
const BOM = ch(0xfeff);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const NUL = ch(0);

describe('displayText', () => {
  const name = displayText(2, 20);

  it('accepts ordinary names, including Urdu with a zero-width non-joiner', () => {
    expect(name.parse('  Ada Lovelace  ')).toBe('Ada Lovelace');
    const urdu = `می${ZWNJ}خواهم`;
    expect(name.parse(urdu)).toBe(urdu);
  });

  it('refuses bidirectional overrides and isolates', () => {
    expect(name.safeParse(`Ali${RLO}evil`).success).toBe(false);
    expect(name.safeParse(`${LRI}Ali`).success).toBe(false);
  });

  it('refuses zero-width spaces, soft hyphens and byte-order marks', () => {
    for (const invisible of [ZWSP, WORD_JOINER, SOFT_HYPHEN, BOM]) {
      expect(name.safeParse(`Al${invisible}i`).success).toBe(false);
    }
  });

  it('refuses control characters, including tabs and newlines inside the text', () => {
    expect(name.safeParse(`Al${NUL}i`).success).toBe(false);
    expect(name.safeParse('Al\ni').success).toBe(false);
    expect(name.safeParse('Al\ti').success).toBe(false);
  });

  it('still enforces the length bounds after trimming', () => {
    expect(name.safeParse(' a ').success).toBe(false);
    expect(name.safeParse('x'.repeat(21)).success).toBe(false);
  });
});
