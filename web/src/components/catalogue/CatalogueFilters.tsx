'use client';

import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import type { Board, CatalogueSubject, Level, Pacing } from '@/lib/api/types';
import { PACINGS, SORTS, type CatalogueFilters, type Sort } from '@/lib/catalogue-url';
import { PACING_LABELS } from '@/lib/format';
import { minorToMajorInput, parseMajorToMinor } from '@/lib/money';
import styles from './Catalogue.module.css';

export const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest first',
  title: 'Title (A–Z)',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
};

/** Search is applied on submit (Enter or the button), not on every keystroke. */
export function SearchBox({
  initial,
  onSearch,
}: {
  initial: string;
  onSearch: (q?: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = draft.trim();
    if (q.length === 1) {
      setError('Type at least 2 characters');
      return;
    }
    setError(undefined);
    onSearch(q || undefined);
  }

  return (
    <form role="search" className={styles.search} onSubmit={submit}>
      <Input
        label="Search courses"
        hideLabel
        type="search"
        name="q"
        placeholder="Search by title, subject, syllabus or teacher"
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        error={error}
        className={styles.searchInput}
      />
      <Button type="submit">Search</Button>
    </form>
  );
}

export function SortSelect({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <Select
      label="Sort by"
      value={value}
      onChange={(e) => onChange(e.target.value as Sort)}
      className={styles.sort}
    >
      {SORTS.map((sort) => (
        <option key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </option>
      ))}
    </Select>
  );
}

interface PanelProps {
  filters: CatalogueFilters;
  subjects: CatalogueSubject[];
  boards: Board[];
  levels: Level[];
  onChange: (change: Partial<CatalogueFilters>) => void;
}

/** Subject, board, level, pacing, free-only and price range (#42). Each applies at once. */
export function CatalogueFiltersPanel({ filters, subjects, boards, levels, onChange }: PanelProps) {
  const orUndefined = (value: string) => value || undefined;
  return (
    <div className={styles.filters}>
      <h2 className="visually-hidden">Filters</h2>
      <Select
        label="Subject"
        value={filters.subjectId ?? ''}
        onChange={(e) => onChange({ subjectId: orUndefined(e.target.value) })}
      >
        <option value="">All subjects</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.courseCount})
          </option>
        ))}
      </Select>
      <Select
        label="Exam board"
        value={filters.boardId ?? ''}
        onChange={(e) => onChange({ boardId: orUndefined(e.target.value) })}
      >
        <option value="">All boards</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        label="Level"
        value={filters.levelId ?? ''}
        disabled={!filters.boardId}
        hint={filters.boardId ? undefined : 'Choose an exam board first'}
        onChange={(e) => onChange({ levelId: orUndefined(e.target.value) })}
      >
        <option value="">All levels</option>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Select
        label="Pacing"
        value={filters.pacing ?? ''}
        onChange={(e) => onChange({ pacing: orUndefined(e.target.value) as Pacing | undefined })}
      >
        <option value="">Any pacing</option>
        {PACINGS.map((p) => (
          <option key={p} value={p}>
            {PACING_LABELS[p]}
          </option>
        ))}
      </Select>
      <Checkbox
        label="Free courses only"
        checked={filters.freeOnly}
        onChange={(e) => onChange({ freeOnly: e.target.checked })}
      />
      <PriceRange
        key={`${filters.minPriceMinor ?? ''}-${filters.maxPriceMinor ?? ''}`}
        filters={filters}
        onChange={onChange}
      />
    </div>
  );
}

/** Prices are typed in major units and sent as minor units (string maths, never floats). */
function PriceRange({ filters, onChange }: Pick<PanelProps, 'filters' | 'onChange'>) {
  const [min, setMin] = useState(
    filters.minPriceMinor ? minorToMajorInput(filters.minPriceMinor) : '',
  );
  const [max, setMax] = useState(
    filters.maxPriceMinor ? minorToMajorInput(filters.maxPriceMinor) : '',
  );
  const [errors, setErrors] = useState<{ min?: string; max?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const minMinor = min.trim() ? parseMajorToMinor(min) : undefined;
    const maxMinor = max.trim() ? parseMajorToMinor(max) : undefined;
    const next: typeof errors = {};
    if (minMinor === null) next.min = 'Enter an amount, e.g. 1500';
    if (maxMinor === null) next.max = 'Enter an amount, e.g. 5000';
    if (minMinor && maxMinor && BigInt(minMinor) > BigInt(maxMinor)) {
      next.max = 'Must be at least the minimum';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onChange({ minPriceMinor: minMinor ?? undefined, maxPriceMinor: maxMinor ?? undefined });
  }

  const disabled = filters.freeOnly;
  return (
    <form className={styles.priceForm} onSubmit={submit} noValidate>
      <fieldset className={styles.priceFieldset} disabled={disabled}>
        <legend className={styles.legend}>Price range</legend>
        {disabled && <p className="muted">Not used with “Free courses only”.</p>}
        <div className={styles.priceInputs}>
          <Input
            label="Min"
            inputMode="decimal"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            error={errors.min}
          />
          <Input
            label="Max"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            error={errors.max}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Apply price
        </Button>
      </fieldset>
    </form>
  );
}
