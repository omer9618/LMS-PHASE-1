'use client';

import { useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui';
import styles from './Teacher.module.css';

/**
 * A destructive action that asks once more inline (no modal): the first press reveals the
 * question with Confirm and Cancel.
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

  if (!asking) {
    return (
      <Button
        variant={variant === 'danger' ? 'secondary' : variant}
        size={size}
        onClick={() => setAsking(true)}
      >
        {children}
      </Button>
    );
  }
  return (
    <span className={styles.actions} role="group" aria-label="Confirm">
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
