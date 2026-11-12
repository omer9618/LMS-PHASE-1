import type { Prisma } from '@prisma/client';

/** Escapes \, % and _ so user text matches literally inside a SQL LIKE pattern. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

/** A case-insensitive "contains" filter for user-typed search text; wildcards match literally. */
export function containsText(text: string): { contains: string; mode: Prisma.QueryMode } {
  return { contains: escapeLike(text), mode: 'insensitive' };
}
