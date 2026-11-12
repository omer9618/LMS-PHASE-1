import { z } from 'zod';

// Building blocks for request schemas, shared by every module.

/** Route params that are all UUIDs: `uuidParams('courseId', 'lessonId')`. */
export function uuidParams<const K extends string>(...keys: K[]) {
  return z.object(Object.fromEntries(keys.map((key) => [key, z.uuid()])) as Record<K, z.ZodUUID>);
}

/** `limit` / `offset` query fields; spread into a query schema: `{ ...paging({ max: 100 }) }`. */
export function paging(options: { max: number; default?: number; maxOffset?: number }) {
  const offset = z.coerce.number().int().min(0);
  return {
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(options.max)
      .default(options.default ?? 50),
    offset: (options.maxOffset === undefined ? offset : offset.max(options.maxOffset)).default(0),
  };
}

/**
 * Characters that make a displayed name lie: bidirectional overrides and isolates (which reverse
 * the text around them) and zero-width or soft-hyphen characters (invisible look-alikes).
 * Zero-width non-joiner and joiner stay allowed: Urdu, Persian and emoji need them.
 */
const DECEPTIVE_CHARS = /[\u00AD\u200B\u2060\u202A-\u202E\u2066-\u2069\uFEFF]/;

function hasControlChars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A trimmed single-line name or title: no control, bidi-override or invisible characters. */
export function displayText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !hasControlChars(v), 'Must not contain control characters')
    .refine(
      (v) => !DECEPTIVE_CHARS.test(v),
      'Must not contain invisible or direction-control characters',
    );
}
