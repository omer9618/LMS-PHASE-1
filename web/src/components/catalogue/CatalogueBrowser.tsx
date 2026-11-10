'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { Alert, Button, Icon } from '@/components/ui';
import { catalogueApi } from '@/lib/api/catalogue';
import { errorMessage } from '@/lib/api/errors';
import {
  activeFilterCount,
  PAGE_SIZE,
  parseCatalogueParams,
  toCatalogueSearch,
  updateFilters,
  type CatalogueFilters,
} from '@/lib/catalogue-url';
import { useQuery } from '@tanstack/react-query';
import { CourseCard } from './CourseCard';
import { CatalogueFiltersPanel, SearchBox, SortSelect } from './CatalogueFilters';
import styles from './Catalogue.module.css';

/**
 * The public catalogue (#40–#44). Every filter, the search, the sort and the page live in the
 * URL (#42): changing one pushes a new URL, and the listing is loaded from the URL alone, so
 * links, bookmarks and the back button all restore the same listing.
 */
export function CatalogueBrowser() {
  const router = useRouter();
  const filters = parseCatalogueParams(useSearchParams());
  const search = toCatalogueSearch(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  const listing = useQuery({
    queryKey: ['listing', search],
    queryFn: ({ signal }) => catalogueApi.listing(filters, signal),
  });
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: ({ signal }) => catalogueApi.subjects(signal),
  });
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: ({ signal }) => catalogueApi.boards(signal),
  });
  const levels = useQuery({
    queryKey: ['levels', filters.boardId],
    queryFn: ({ signal }) => catalogueApi.levels(filters.boardId!, signal),
    enabled: Boolean(filters.boardId),
  });

  function apply(change: Partial<CatalogueFilters>) {
    router.push(`/courses${toCatalogueSearch(updateFilters(filters, change))}`, {
      scroll: false,
    });
  }

  const activeCount = activeFilterCount(filters);
  const pageCount =
    listing.status === 'success' ? Math.max(1, Math.ceil(listing.data.total / PAGE_SIZE)) : 1;

  const pageHref = (page: number) =>
    `/courses${toCatalogueSearch(updateFilters(filters, { page }))}`;

  return (
    <div className={styles.layout}>
      <div className={styles.top}>
        <div className={styles.heading}>
          <p className="eyebrow">Cambridge and Edexcel</p>
          <h1>Courses</h1>
        </div>
        <SearchBox key={filters.q ?? ''} initial={filters.q ?? ''} onSearch={(q) => apply({ q })} />
      </div>

      <div className={styles.sidebar}>
        <button
          type="button"
          className={styles.filterToggle}
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{activeCount > 0 ? ` (${activeCount} active)` : ''}
          <Icon name={filtersOpen ? 'chevronUp' : 'chevronDown'} />
        </button>
        <div id={panelId} className={styles.filterPanel} data-open={filtersOpen}>
          <CatalogueFiltersPanel
            filters={filters}
            subjects={subjects.status === 'success' ? subjects.data : []}
            boards={boards.status === 'success' ? boards.data : []}
            levels={levels.status === 'success' ? levels.data : []}
            onChange={apply}
          />
          {(activeCount > 0 || filters.q) && (
            <Link href="/courses" className={styles.clear}>
              Clear search and filters
            </Link>
          )}
        </div>
      </div>

      <section className={styles.results} aria-labelledby="results-heading">
        <div className={styles.resultsBar}>
          <div>
            <h2 id="results-heading" className={styles.resultsHeading} aria-live="polite">
              {listing.status === 'success'
                ? `${listing.data.total} ${listing.data.total === 1 ? 'course' : 'courses'}`
                : listing.status === 'pending'
                  ? 'Loading courses…'
                  : 'Courses'}
            </h2>
            {listing.status === 'success' && (
              // #44: the backend states its ordering criterion; show it with the results.
              <p className="hint">
                <span className="visually-hidden">Ordering: </span>
                {listing.data.ordering}
              </p>
            )}
          </div>
          <SortSelect value={filters.sort} onChange={(sort) => apply({ sort })} />
        </div>

        {listing.status === 'error' && (
          <Alert tone="danger" title="Could not load courses">
            <p>{errorMessage(listing.error)}</p>
            <Button variant="secondary" size="sm" onClick={() => void listing.refetch()}>
              Try again
            </Button>
          </Alert>
        )}

        {listing.status === 'success' && listing.data.items.length === 0 && (
          <div className={styles.empty}>
            <p>No courses match {filters.q ? `“${filters.q}” and ` : ''}these filters.</p>
            <Link href="/courses">Show all courses</Link>
          </div>
        )}

        {listing.status === 'success' && listing.data.items.length > 0 && (
          <>
            <ul className={styles.cards}>
              {listing.data.items.map((course) => (
                <li key={course.id}>
                  <CourseCard course={course} />
                </li>
              ))}
            </ul>
            {pageCount > 1 && (
              <nav className={styles.pagination} aria-label="Pages">
                {filters.page > 1 ? (
                  <Link href={pageHref(filters.page - 1)} rel="prev">
                    <Icon name="arrowLeft" /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span>
                  Page {filters.page} of {pageCount}
                </span>
                {filters.page < pageCount ? (
                  <Link href={pageHref(filters.page + 1)} rel="next">
                    Next <Icon name="arrowRight" />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
