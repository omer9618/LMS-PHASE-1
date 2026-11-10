import { Button } from './Button';
import styles from './Pager.module.css';

/** Previous and next for a list with a known total: "21–40 of 133". */
export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (total <= limit && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <nav className={styles.pager} aria-label="Pages">
      <span className="muted">
        {from}–{to} of {total}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </Button>
    </nav>
  );
}

/** Previous and next for a list that returns no total. */
export function SimplePager({
  hasMore,
  limit,
  offset,
  onChange,
}: {
  hasMore: boolean;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  if (!hasMore && offset === 0) return null;
  return (
    <nav className={styles.pager} aria-label="Pages">
      <Button
        size="sm"
        variant="secondary"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!hasMore}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </Button>
    </nav>
  );
}
