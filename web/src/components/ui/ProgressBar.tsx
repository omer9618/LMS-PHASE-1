import { cx } from './cx';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** 0–100. Out-of-range values are clamped. */
  value: number;
  /** What the bar measures, for screen readers: "Economics: 67% complete". */
  label: string;
  /** Green for learning progress; blue for a task still running (an upload). */
  tone?: 'success' | 'primary';
  className?: string;
}

/** The one progress bar: a sunken track with a fill. Course progress and uploads share it. */
export function ProgressBar({ value, label, tone = 'success', className }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cx(styles.track, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className={cx(styles.fill, tone === 'primary' && styles.primary)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
