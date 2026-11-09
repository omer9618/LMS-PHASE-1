import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Badge.module.css';

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'primary'
  /** Highlighter yellow: queue counts in navigation. */
  | 'highlight';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** A short status or category label. The text carries the meaning; colour only reinforces it. */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span {...rest} className={cx(styles.badge, styles[tone], className)} />;
}
