import { cx } from './cx';
import styles from './Skeleton.module.css';

/**
 * What a screen looks like while it loads: sand bars where the text will be, so nothing jumps when
 * the data arrives. The words are for screen readers; the bars are decoration.
 */
export function Skeleton({
  label,
  lines = 3,
  className,
}: {
  /** "Loading your courses…" */
  label: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div role="status" className={cx(styles.skeleton, className)}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.bar} aria-hidden="true" />
      ))}
    </div>
  );
}
