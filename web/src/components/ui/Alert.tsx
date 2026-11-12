import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  /** The title's element: `h1` when the alert is the whole page (a failed load), else a `p`. */
  titleAs?: 'p' | 'h1' | 'h2';
  children?: ReactNode;
  className?: string;
}

/**
 * A message block. Errors use role="alert" (announced at once); everything else role="status"
 * (announced politely).
 */
export function Alert({
  tone = 'info',
  title,
  titleAs: Title = 'p',
  children,
  className,
}: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(styles.alert, styles[tone], className)}
    >
      {title && <Title className={styles.title}>{title}</Title>}
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
