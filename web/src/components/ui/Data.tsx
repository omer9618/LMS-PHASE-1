import Link from 'next/link';
import type { ReactNode } from 'react';
import { humanize } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { STATUS_TONES } from '@/lib/status';
import { Badge, type BadgeTone } from './Badge';
import { cx } from './cx';
import styles from './Data.module.css';

const EMPTY = '—';

/** Label/value pairs in a responsive grid. Empty values show a dash. */
export function Facts({
  items,
  columns = 'auto',
}: {
  items: Array<[ReactNode, ReactNode]>;
  /** "auto" fills the width; "one" keeps a single label/value column (side panels). */
  columns?: 'auto' | 'one';
}) {
  return (
    <dl className={cx(styles.facts, 'eyebrow-terms', columns === 'one' && styles.factsOne)}>
      {items.map(([label, value], i) => (
        <div key={i} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === '' ? EMPTY : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Exact money from minor units, in mono with aligned digits. */
export function Money({
  minor,
  currency,
}: {
  minor: string | null | undefined;
  currency: string | null | undefined;
}) {
  if (minor === null || minor === undefined) return <span>{EMPTY}</span>;
  return <span className={styles.money}>{formatMoney(minor, currency)}</span>;
}

/** An API status as a word chip ("PENDING_APPROVAL" → "Pending approval"). */
export function StatusBadge({
  status,
  tones = STATUS_TONES,
  label,
}: {
  status: string;
  tones?: Partial<Record<string, BadgeTone>>;
  label?: string;
}) {
  return <Badge tone={tones[status] ?? 'neutral'}>{label ?? humanize(status)}</Badge>;
}

export type StatTone = 'neutral' | 'primary' | 'warning' | 'danger';

/** One metric: a mono figure under a mono label. Tint it only when the number is a problem. */
export function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
  action,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  /** Where to act on this number ("Open queue"). */
  action?: { href: string; label: string };
}) {
  return (
    <div className={cx(styles.stat, styles[`stat-${tone}`])}>
      <dt className="eyebrow">{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
      {note && <dd className={styles.statNote}>{note}</dd>}
      {action && (
        <dd className={styles.statAction}>
          <Link href={action.href}>
            {action.label}
            <span className="visually-hidden">: {label}</span>
          </Link>
        </dd>
      )}
    </div>
  );
}

/** A row of StatTiles that wraps on narrow screens. */
export function StatGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl className={styles.statGrid} aria-label={label}>
      {children}
    </dl>
  );
}
