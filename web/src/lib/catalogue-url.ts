import type { QueryValue } from './api/client';
import type { Pacing } from './api/types';

/**
 * #42: the catalogue's filter state lives in the URL, so a listing can be shared, bookmarked and
 * restored with the back button. URL keys match the API's query names (GET /catalogue/courses),
 * except `page`, which the web app turns into `offset`.
 */

export const SORTS = ['newest', 'title', 'price_asc', 'price_desc'] as const;
export type Sort = (typeof SORTS)[number];
export const DEFAULT_SORT: Sort = 'newest';

export const PACINGS: readonly Pacing[] = ['FREE', 'SEQUENTIAL'];

export const PAGE_SIZE = 24;

export interface CatalogueFilters {
  q?: string;
  subjectId?: string;
  boardId?: string;
  levelId?: string;
  pacing?: Pacing;
  freeOnly: boolean;
  /** Minor units, digits only. */
  minPriceMinor?: string;
  maxPriceMinor?: string;
  sort: Sort;
  /** 1-based. */
  page: number;
}

export const EMPTY_FILTERS: CatalogueFilters = { freeOnly: false, sort: DEFAULT_SORT, page: 1 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINOR = /^\d{1,18}$/;
/** The API's offset ceiling (10,000) divided by the page size. */
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

interface ParamsLike {
  get(name: string): string | null;
}

function pick<T>(
  raw: string | null,
  valid: (v: string) => boolean,
  map: (v: string) => T,
): T | undefined {
  return raw !== null && valid(raw) ? map(raw) : undefined;
}

/**
 * Reads filters from the URL. Anything the API would reject (a hand-edited or stale link) is
 * dropped rather than shown as an error, so a bad link still lands on a working listing.
 */
export function parseCatalogueParams(params: ParamsLike): CatalogueFilters {
  const q = params.get('q')?.trim();
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    q: q && q.length >= 2 ? q.slice(0, 100) : undefined,
    subjectId: pick(params.get('subjectId'), (v) => UUID.test(v), String),
    boardId: pick(params.get('boardId'), (v) => UUID.test(v), String),
    levelId: pick(params.get('levelId'), (v) => UUID.test(v), String),
    pacing: pick(
      params.get('pacing'),
      (v) => (PACINGS as string[]).includes(v),
      (v) => v as Pacing,
    ),
    freeOnly: params.get('free') === 'true',
    minPriceMinor: pick(params.get('minPriceMinor'), (v) => MINOR.test(v), String),
    maxPriceMinor: pick(params.get('maxPriceMinor'), (v) => MINOR.test(v), String),
    sort:
      pick(
        params.get('sort'),
        (v) => (SORTS as readonly string[]).includes(v),
        (v) => v as Sort,
      ) ?? DEFAULT_SORT,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Filters → URL query string. Defaults are left out so the plain listing has a clean URL. */
export function toCatalogueSearch(filters: CatalogueFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.subjectId) params.set('subjectId', filters.subjectId);
  if (filters.boardId) params.set('boardId', filters.boardId);
  if (filters.levelId) params.set('levelId', filters.levelId);
  if (filters.pacing) params.set('pacing', filters.pacing);
  if (filters.freeOnly) params.set('free', 'true');
  // "Free only" overrides a price range in the API, so a range is not kept alongside it.
  if (!filters.freeOnly && filters.minPriceMinor)
    params.set('minPriceMinor', filters.minPriceMinor);
  if (!filters.freeOnly && filters.maxPriceMinor)
    params.set('maxPriceMinor', filters.maxPriceMinor);
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Filters → query for GET /catalogue/courses. */
export function toCatalogueApiQuery(filters: CatalogueFilters): Record<string, QueryValue> {
  return {
    q: filters.q,
    subjectId: filters.subjectId,
    boardId: filters.boardId,
    levelId: filters.levelId,
    pacing: filters.pacing,
    free: filters.freeOnly ? 'true' : undefined,
    minPriceMinor: filters.freeOnly ? undefined : filters.minPriceMinor,
    maxPriceMinor: filters.freeOnly ? undefined : filters.maxPriceMinor,
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
  };
}

/**
 * Applies a change and resets to page 1, unless the change is the page itself. Changing the board
 * clears the level, because levels belong to a board.
 */
export function updateFilters(
  current: CatalogueFilters,
  change: Partial<CatalogueFilters>,
): CatalogueFilters {
  const next: CatalogueFilters = { ...current, ...change };
  if ('boardId' in change && change.boardId !== current.boardId) next.levelId = undefined;
  if (!('page' in change)) next.page = 1;
  return next;
}

/** How many filters (not search or sort) are active: shown on the mobile filter toggle. */
export function activeFilterCount(filters: CatalogueFilters): number {
  return [
    filters.subjectId,
    filters.boardId,
    filters.levelId,
    filters.pacing,
    filters.freeOnly || undefined,
    !filters.freeOnly && (filters.minPriceMinor || filters.maxPriceMinor) ? 'price' : undefined,
  ].filter(Boolean).length;
}
