'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Button,
  Textarea,
  type BadgeTone,
  type ButtonVariant,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/money';
import type { ApiState } from '@/lib/use-api';
import styles from './Admin.module.css';

/** Small building blocks shared by every admin screen (compact density). */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Loading, error (with retry) or the data. */
export function Loadable<T>({
  state,
  what,
  children,
}: {
  state: ApiState<T> & { reload: () => void };
  /** "users", "the order": completes "Loading …" and "Could not load …". */
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <p role="status">Loading {what}…</p>;
  if (state.status === 'error') {
    return (
      <Alert tone="danger" title={`Could not load ${what}`}>
        <p>{errorMessage(state.error)}</p>
        <Button size="sm" variant="secondary" onClick={state.reload}>
          Try again
        </Button>
      </Alert>
    );
  }
  return <>{children(state.data)}</>;
}

/** Label/value pairs. */
export function Facts({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className={styles.facts}>
      {items.map(([label, value], i) => (
        <div key={i} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Money({
  minor,
  currency,
}: {
  minor: string | null | undefined;
  currency: string | null | undefined;
}) {
  if (minor === null || minor === undefined) return <span>—</span>;
  return <span className={styles.money}>{formatMoney(minor, currency)}</span>;
}

const TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  PUBLISHED: 'success',
  VERIFIED: 'success',
  HIRED: 'success',
  ACCEPTED: 'success',
  RESOLVED: 'success',
  PENDING_APPROVAL: 'warning',
  PROOF_SUBMITTED: 'warning',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'info',
  PENDING: 'info',
  OPEN: 'warning',
  DISPUTED: 'warning',
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
  EXPIRED: 'neutral',
  LAPSED: 'neutral',
  SUSPENDED: 'danger',
  DELETED: 'danger',
  REJECTED: 'danger',
  REVOKED: 'danger',
  REFUNDED: 'danger',
};

/** "PENDING_APPROVAL" → "Pending approval". */
export function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{humanize(status)}</Badge>;
}

export interface Mutation {
  pending: boolean;
  error: string | null;
  notice: string | null;
  run(action: () => Promise<unknown>, success?: string): Promise<boolean>;
  clear(): void;
}

/** One write at a time, with its error or success message. */
export function useMutation(): Mutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    pending,
    error,
    notice,
    clear: () => {
      setError(null);
      setNotice(null);
    },
    async run(action, success) {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        await action();
        if (success) setNotice(success);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setPending(false);
      }
    },
  };
}

export function MutationStatus({ mutation }: { mutation: Mutation }) {
  if (mutation.error) {
    return (
      <Alert tone="danger" title="That did not work">
        <p>{mutation.error}</p>
      </Alert>
    );
  }
  if (mutation.notice) return <Alert tone="success">{mutation.notice}</Alert>;
  return null;
}

/**
 * An action that needs a written reason (suspend, reject, revoke, unpublish...). The button opens a
 * small form; nothing happens until the reason is confirmed.
 */
export function ReasonAction({
  label,
  confirmLabel,
  reasonLabel = 'Reason',
  hint,
  minLength = 3,
  optional = false,
  variant = 'secondary',
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  reasonLabel?: string;
  hint?: ReactNode;
  minLength?: number;
  optional?: boolean;
  variant?: ButtonVariant;
  /** Resolves true when the action succeeded (closes the form). */
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!optional && trimmed.length < minLength) {
      setError(`Write at least ${minLength} characters.`);
      return;
    }
    setBusy(true);
    const ok = await onConfirm(trimmed);
    setBusy(false);
    if (ok) {
      setOpen(false);
      setReason('');
      setError(null);
    }
  }

  return (
    <form className={styles.inlineForm} onSubmit={submit} aria-label={label}>
      <Textarea
        label={reasonLabel}
        hint={hint}
        rows={2}
        value={reason}
        error={error}
        aria-required={!optional}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className={styles.actions}>
        <Button
          type="submit"
          size="sm"
          variant={variant === 'secondary' ? 'primary' : variant}
          loading={busy}
        >
          {confirmLabel ?? label}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

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

/** Previous/next for lists that return no total. */
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

/** "2 Nov 2026, 14:05" in the viewer's time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
