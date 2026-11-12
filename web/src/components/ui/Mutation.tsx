'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { reasonForm } from '@/lib/forms/admin';
import type { Mutation } from '@/lib/use-mutation';
import { validateForm } from '@/lib/forms/validate';
import { Alert } from './Alert';
import { Button, type ButtonProps, type ButtonVariant } from './Button';
import { Textarea } from './Field';
import styles from './Mutation.module.css';

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
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Put focus back on the button that opened the form once the form closes.
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!open) {
    return (
      <Button ref={trigger} size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
        <Ellipsis />
      </Button>
    );
  }

  function cancel() {
    setOpen(false);
    setError(null);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      cancel();
    }
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
    <form className={styles.inlineForm} onSubmit={submit} onKeyDown={onKeyDown} aria-label={label}>
      <Textarea
        label={reasonLabel}
        hint={hint}
        rows={2}
        value={reason}
        error={error}
        aria-required={!optional}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="cluster">
        <Button
          type="submit"
          size="sm"
          variant={variant === 'secondary' ? 'primary' : variant}
          loading={busy}
        >
          {confirmLabel ?? label}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The "…" that says a button opens one more step (kept out of the accessible name). */
function Ellipsis() {
  return <span aria-hidden="true">…</span>;
}

/**
 * An action that asks once more inline (no modal): the first press reveals the question with
 * Confirm and Cancel. Escape cancels, and focus goes back to the button that asked. A `danger`
 * action is an outline until it is confirmed.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  variant = 'danger',
  size = 'sm',
}: {
  children: ReactNode;
  question: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const group = useRef<HTMLSpanElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) group.current?.focus();
    else if (wasAsking.current) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!asking) {
    return (
      <Button ref={trigger} variant={variant} size={size} onClick={() => setAsking(true)}>
        {children}
        <Ellipsis />
      </Button>
    );
  }
  return (
    <span
      ref={group}
      className="cluster"
      role="group"
      aria-label="Confirm"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.stopPropagation();
          setAsking(false);
        }
      }}
    >
      <span>{question}</span>
      <Button
        variant={variant}
        size={size}
        loading={busy}
        loadingText="Working…"
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </Button>
    </span>
  );
}
