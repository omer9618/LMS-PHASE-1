'use client';

import { useState } from 'react';
import { Alert, Button, Money } from '@/components/ui';
import type { PaymentInstructions as Instructions } from '@/lib/api/orders';
import { bankDetailsReady, timeUntil } from '@/lib/orders/display';
import { formatDateTime } from '@/lib/format';
import styles from './Orders.module.css';

/**
 * #55: what to transfer, where and by when. The reference and amount are the two things a
 * student must type into their bank app, so they are the largest text and can be copied. While
 * the bank details are still the shipped placeholders, nothing here invites a transfer.
 */
export function PaymentInstructions({ instructions }: { instructions: Instructions }) {
  const deadline = formatDateTime(instructions.expiresAt);
  // Read once per render: a relative deadline does not need to tick.
  const [now] = useState(() => Date.now());

  if (!bankDetailsReady(instructions.bankTransferInstructions)) {
    return (
      <Alert tone="warning" title="Payment details are not available yet">
        <p>
          We will email you the bank details as soon as they are ready. Please do not transfer any
          money until then.
        </p>
        {deadline && <p>We hold your order until {deadline}.</p>}
      </Alert>
    );
  }

  return (
    <section className={styles.instructions} aria-labelledby="pay-heading">
      <h2 id="pay-heading">How to pay</h2>
      <dl className={styles.payTiles}>
        <div className={styles.payTile}>
          <dt className="eyebrow">Amount</dt>
          <dd className={styles.bigValue}>
            <Money minor={instructions.amountMinor} currency={instructions.currency} />
          </dd>
        </div>
        <div className={`${styles.payTile} ${styles.payTileRef}`}>
          <dt className="eyebrow">Transfer remark (required)</dt>
          <dd className={styles.bigValue}>
            <code>{instructions.paymentReference}</code>{' '}
            <CopyButton value={instructions.paymentReference} label="Copy reference" />
          </dd>
        </div>
      </dl>
      <div className={styles.bankDetails}>
        <h3>Bank details</h3>
        <p className={styles.preLine}>{instructions.bankTransferInstructions}</p>
      </div>
      <p className={styles.muted}>
        {deadline && instructions.expiresAt && (
          <>
            Pay by <strong>{deadline}</strong> ({timeUntil(instructions.expiresAt, now)}).{' '}
          </>
        )}
        We usually confirm within {instructions.verificationTurnaroundHours} hours of your
        transaction ID.
      </p>
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => undefined,
          )
        }
      >
        {copied ? 'Copied' : label}
      </Button>
      {/* Announced to screen readers; the visible label changes too. */}
      <span className="visually-hidden" role="status">
        {copied ? 'Reference copied' : ''}
      </span>
    </>
  );
}
