'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import type { OrdersApi, StudentOrder, SubmittedProof } from '@/lib/api/orders';
import { validateProofForm } from '@/lib/order-display';
import styles from './Orders.module.css';

/** The API's PAYMENT_PROOF policy: PDF, PNG, JPEG or WebP, up to 5 MB (checked again there). */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

export interface ProofFormProps {
  order: StudentOrder;
  client: OrdersApi;
  onSubmitted: (result: SubmittedProof) => void;
}

/**
 * #58: the transaction ID (required), the amount transferred and a screenshot or PDF (both
 * optional). After a rejection the same form resubmits on the same order.
 */
export function ProofForm({ order, client, onSubmitted }: ProofFormProps) {
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const resubmit = order.status === 'REJECTED';
  const additional =
    order.status === 'PROOF_SUBMITTED' || order.lastDecision?.kind === 'TOP_UP_REQUESTED';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const checked = validateProofForm({ transactionId, amount }, order.currency);
    const fileError = file && file.size > MAX_BYTES ? 'The file must be 5 MB or smaller' : null;
    if (!checked.ok || fileError) {
      setErrors({
        ...(checked.ok ? {} : checked.errors),
        ...(fileError ? { file: fileError } : {}),
      });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const result = await client.submitProof(order.id, {
        transactionId: checked.transactionId,
        amountClaimedMinor: checked.amountClaimedMinor,
        file,
      });
      setTransactionId('');
      setAmount('');
      setFile(null);
      onSubmitted(result);
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.amountClaimedMinor) fields.amount = fields.amountClaimedMinor;
      setErrors(fields);
      setFormError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="proof-heading">
      <h2 id="proof-heading">
        {resubmit
          ? 'Submit a corrected payment'
          : additional
            ? 'Add another transfer'
            : 'I have paid'}
      </h2>
      <p className="muted">
        {additional
          ? 'Made a further transfer (for example a top-up)? Add its transaction ID here.'
          : 'Enter the transaction ID from your bank or wallet app. A screenshot helps us confirm faster.'}
      </p>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Input
        label="Transaction ID"
        required
        value={transactionId}
        onChange={(e) => setTransactionId(e.target.value)}
        error={errors.transactionId}
        autoComplete="off"
        maxLength={120}
      />
      <Input
        label={`Amount you transferred (${order.currency})`}
        hint="Optional. For example 15000 or 15,000.50"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amount}
        autoComplete="off"
      />
      <Input
        label="Screenshot or PDF of the transfer"
        hint="Optional. PDF, PNG, JPEG or WebP, up to 5 MB."
        type="file"
        accept={ACCEPT}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        error={errors.file}
      />
      <div>
        <Button type="submit" loading={sending} loadingText="Sending…">
          Submit payment details
        </Button>
      </div>
    </form>
  );
}
