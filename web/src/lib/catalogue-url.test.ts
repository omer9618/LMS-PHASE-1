import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  PAGE_SIZE,
  parseCatalogueParams,
  toCatalogueApiQuery,
  toCatalogueSearch,
  updateFilters,
  type CatalogueFilters,
} from './catalogue-url';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const BOARD = '22222222-2222-4222-8222-222222222222';
const LEVEL = '33333333-3333-4333-8333-333333333333';

const parse = (qs: string) => parseCatalogueParams(new URLSearchParams(qs));

describe('parseCatalogueParams', () => {
  it('gives the defaults for an empty URL', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS);
  });

  it('reads every filter', () => {
    expect(
      parse(
        `q=physics&subjectId=${SUBJECT}&boardId=${BOARD}&levelId=${LEVEL}&pacing=SEQUENTIAL` +
          '&minPriceMinor=100000&maxPriceMinor=500000&sort=price_asc&page=3',
      ),
    ).toEqual({
      q: 'physics',
      subjectId: SUBJECT,
      boardId: BOARD,
      levelId: LEVEL,
      pacing: 'SEQUENTIAL',
      freeOnly: false,
      minPriceMinor: '100000',
      maxPriceMinor: '500000',
      sort: 'price_asc',
      page: 3,
    });
    expect(parse('free=true').freeOnly).toBe(true);
  });

  it('drops values the API would reject instead of failing', () => {
    expect(
      parse(
        'q=a&subjectId=not-a-uuid&pacing=FAST&free=yes&minPriceMinor=12.5&maxPriceMinor=-1' +
          '&sort=popular&page=0',
      ),
    ).toEqual(EMPTY_FILTERS);
    expect(parse('page=abc').page).toBe(1);
    expect(parse('page=999999').page).toBeLessThanOrEqual(Math.floor(10_000 / PAGE_SIZE) + 1);
  });

  it('trims the search and caps its length', () => {
    expect(parse('q=%20%20physics%20').q).toBe('physics');
    expect(parse(`q=${'x'.repeat(150)}`).q).toHaveLength(100);
  });
});

describe('toCatalogueSearch', () => {
  it('is empty for the defaults, so the plain listing has a clean URL', () => {
    expect(toCatalogueSearch(EMPTY_FILTERS)).toBe('');
  });

  it('round-trips through parseCatalogueParams', () => {
    const filters: CatalogueFilters = {
      q: 'organic chemistry',
      subjectId: SUBJECT,
      boardId: BOARD,
      levelId: LEVEL,
      pacing: 'FREE',
      freeOnly: false,
      minPriceMinor: '0',
      maxPriceMinor: '999999',
      sort: 'title',
      page: 2,
    };
    const qs = toCatalogueSearch(filters);
    expect(qs.startsWith('?')).toBe(true);
    expect(parse(qs.slice(1))).toEqual(filters);
  });

  it('drops a price range when free-only is on', () => {
    const qs = toCatalogueSearch({ ...EMPTY_FILTERS, freeOnly: true, minPriceMinor: '100' });
    expect(qs).toBe('?free=true');
  });
});

describe('toCatalogueApiQuery', () => {
  it('maps page to offset and free-only to free=true', () => {
    expect(toCatalogueApiQuery({ ...EMPTY_FILTERS, freeOnly: true, page: 3 })).toMatchObject({
      free: 'true',
      sort: 'newest',
      limit: PAGE_SIZE,
      offset: 2 * PAGE_SIZE,
      minPriceMinor: undefined,
    });
    expect(
      toCatalogueApiQuery({ ...EMPTY_FILTERS, minPriceMinor: '5', maxPriceMinor: '9' }),
    ).toMatchObject({ free: undefined, minPriceMinor: '5', maxPriceMinor: '9', offset: 0 });
  });
});

describe('updateFilters', () => {
  it('resets to page 1 on any filter change', () => {
    const current = { ...EMPTY_FILTERS, page: 4 };
    expect(updateFilters(current, { sort: 'title' }).page).toBe(1);
    expect(updateFilters(current, { page: 5 }).page).toBe(5);
  });

  it('clears the level when the board changes, not otherwise', () => {
    const current = { ...EMPTY_FILTERS, boardId: BOARD, levelId: LEVEL };
    expect(updateFilters(current, { boardId: undefined }).levelId).toBeUndefined();
    expect(updateFilters(current, { boardId: BOARD }).levelId).toBe(LEVEL);
    expect(updateFilters(current, { pacing: 'FREE' }).levelId).toBe(LEVEL);
  });
});

describe('activeFilterCount', () => {
  it('counts filters, not search or sort', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: 'phy', sort: 'title' })).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        subjectId: SUBJECT,
        minPriceMinor: '1',
        maxPriceMinor: '2',
      }),
    ).toBe(2);
    expect(activeFilterCount({ ...EMPTY_FILTERS, freeOnly: true, minPriceMinor: '1' })).toBe(1);
  });
});
