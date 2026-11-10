'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Textarea, type ButtonVariant } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import styles from './Admin.module.css';
import { reasonForm } from '@/lib/forms/admin';
import { validateForm } from '@/lib/zod-form';

/**
 * Admin-only building blocks: writes with feedback, reason dialogs, paging. Generic layout and
 * data pieces (PageHeader, Section, Facts, Money, StatusBadge, Loadable) live in components/ui.
 */

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
    const checked = validateForm(reasonForm(minLength, optional), { reason });
    if (!checked.ok) {
      setError(checked.errors.reason ?? null);
      return;
    }
    const trimmed = checked.data.reason;
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
