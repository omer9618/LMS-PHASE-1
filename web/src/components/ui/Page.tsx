import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Page.module.css';

export interface PageHeaderProps {
  title: ReactNode;
  /** Mono uppercase line above the title: where you are, or what the list is sorted by. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** The top of every screen: eyebrow, serif title, one line of help, and the page's actions. */
export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.heading}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export interface SectionProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** The one panel on a screen that holds the current task (review form, editor). */
  raised?: boolean;
  /** No inner padding: for a table or list that runs edge to edge. */
  flush?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** A paper card with an optional title bar. */
export function Section({
  title,
  actions,
  children,
  raised = false,
  flush = false,
  className,
  'aria-label': ariaLabel,
}: SectionProps) {
  return (
    <section
      className={cx(styles.section, raised && styles.raised, className)}
      aria-label={ariaLabel}
    >
      {(title || actions) && (
        <div className={styles.sectionHead}>
          {title && <h2 className={styles.sectionTitle}>{title}</h2>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={cx(styles.sectionBody, flush && styles.flush)}>{children}</div>
    </section>
  );
}

/** Main area plus a side panel that drops below it on narrow screens. */
export function SplitLayout({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.splitMain}>{main}</div>
      <div className={styles.splitAside}>{aside}</div>
    </div>
  );
}
