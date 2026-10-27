/**
 * Catalogue ordering (#44) and filter rules (#42). Pure.
 */
export type CatalogueSortValue = 'newest' | 'title' | 'price_asc' | 'price_desc';

/** Stated with every listing, so the ordering is never a hidden or paid-for ranking. */
export const ORDERING_STATEMENTS: Record<CatalogueSortValue, string> = {
  newest: 'Newest published first. No course can pay for a higher position.',
  title: 'Alphabetical by title.',
  price_asc: 'Lowest price first; free courses first.',
  price_desc: 'Highest price first; free courses last.',
};

export type SortKey =
  | { field: 'publishedAt'; direction: 'desc' }
  | { field: 'title'; direction: 'asc' }
  | { field: 'price'; direction: 'asc' | 'desc' };

export function sortKeys(sort: CatalogueSortValue): SortKey[] {
  switch (sort) {
    case 'newest':
      return [{ field: 'publishedAt', direction: 'desc' }];
    case 'title':
      return [{ field: 'title', direction: 'asc' }];
    case 'price_asc':
      return [{ field: 'price', direction: 'asc' }];
    case 'price_desc':
      return [{ field: 'price', direction: 'desc' }];
  }
}

export interface PriceFilter {
  free?: boolean;
  minPriceMinor?: bigint;
  maxPriceMinor?: bigint;
}

/** A price range only matches paid courses; "free only" overrides it. Invalid ranges match none. */
export function describePriceFilter(
  filter: PriceFilter,
):
  | { kind: 'any' }
  | { kind: 'freeOnly' }
  | { kind: 'none' }
  | { kind: 'paidRange'; min?: bigint; max?: bigint } {
  if (filter.free === true) return { kind: 'freeOnly' };
  const { minPriceMinor: min, maxPriceMinor: max } = filter;
  if (min !== undefined && max !== undefined && min > max) return { kind: 'none' };
  if (min !== undefined || max !== undefined) return { kind: 'paidRange', min, max };
  if (filter.free === false) return { kind: 'paidRange' };
  return { kind: 'any' };
}
