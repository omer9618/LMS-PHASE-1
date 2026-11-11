'use client';

import { useState } from 'react';
import { Button, Money } from '@/components/ui';
import type { PaymentInstructions as Instructions } from '@/lib/api/orders';
import { timeUntil } from '@/lib/orders/display';
import { formatDateTime } from '@/lib/format';
import styles from './Orders.module.css';

/**
 * #55: what to transfer, where and by when. The reference and amount are the two things a
 * student must type into their bank app, so they are the largest text and can be copied.
 */
export function PaymentInstructions({ instructions }: { instructions: Instructions }) {
  const deadline = formatDateTime(instructions.expiresAt);
  // Read once per render: a relative deadline does not need to tick.
  const [now] = useState(() => Date.now());
  return (
    <section className={styles.instructions} aria-labelledby="pay-heading">
      <h2 id="pay-heading">How to pay</h2>
      <dl className={styles.payFacts}>
        <div>
          <dt>Amount to transfer</dt>
          <dd className={styles.bigValue}>
            <Money minor={instructions.amountMinor} currency={instructions.currency} />
          </dd>
        </div>
        <div>
          <dt>Payment reference</dt>
          <dd className={styles.bigValue}>
            <code>{instructions.paymentReference}</code>{' '}
            <CopyButton value={instructions.paymentReference} label="Copy reference" />
          </dd>
        </div>
        {deadline && instructions.expiresAt && (
          <div>
            <dt>Pay by</dt>
            <dd>
              <strong>{deadline}</strong>{' '}
              <span className={styles.muted}>({timeUntil(instructions.expiresAt, now)})</span>
            </dd>
          </div>
        )}
      </dl>
      <div className={styles.bankDetails}>
        <h3>Bank details</h3>
        <p className={styles.preLine}>{instructions.bankTransferInstructions}</p>
      </div>
      <p className={styles.muted}>
        Put the reference in the transfer note so we can match your payment. After you transfer,
        submit the transaction ID below. We usually confirm within{' '}
        {instructions.verificationTurnaroundHours} hours.
      </p>
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
  return (
    <Button
      variant="ghost"
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
  );
}
