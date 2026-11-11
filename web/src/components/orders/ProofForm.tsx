'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from '@/components/ui';
import type { OrdersApi, StudentOrder, SubmittedProof } from '@/lib/api/orders';
import { validateProofForm } from '@/lib/forms/orders';
import { minorToMajorInput, minorUnitExponent } from '@/lib/money';
import { useMutation } from '@/lib/use-mutation';
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
  // What the student most likely sent: the shortfall after a top-up request, else the order total.
  // A further transfer on an order already under review starts empty.
  const expected =
    order.lastDecision?.kind === 'TOP_UP_REQUESTED'
      ? order.lastDecision.shortfallMinor
      : order.status === 'PENDING' || order.status === 'REJECTED'
        ? order.totalMinor
        : null;
  const initialAmount = expected
    ? minorToMajorInput(expected, minorUnitExponent(order.currency))
    : '';
  const [amount, setAmount] = useState(initialAmount);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const send = useMutation();
  const server = send.fieldErrors;
  const shown: Record<string, string> = {
    ...errors,
    ...server,
    ...(server.amountClaimedMinor ? { amount: server.amountClaimedMinor } : {}),
  };

  const resubmit = order.status === 'REJECTED';
  const additional =
    order.status === 'PROOF_SUBMITTED' || order.lastDecision?.kind === 'TOP_UP_REQUESTED';

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    await send.run(async () => {
      const result = await client.submitProof(order.id, {
        transactionId: checked.transactionId,
        amountClaimedMinor: checked.amountClaimedMinor,
        file,
      });
      setTransactionId('');
      setAmount('');
      setFile(null);
      onSubmitted(result);
    });
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
      {send.error && <Alert tone="danger">{send.error}</Alert>}
      <Input
        label="Transaction ID"
        required
        value={transactionId}
        onChange={(e) => setTransactionId(e.target.value)}
        error={shown.transactionId}
        autoComplete="off"
        maxLength={120}
      />
      <Input
        label={`Amount you transferred (${order.currency})`}
        hint={
          expected
            ? 'Optional. Filled in from your order: change it if you sent a different amount.'
            : 'Optional. For example 15000 or 15,000.50'
        }
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={shown.amount}
        autoComplete="off"
      />
      <Input
        label="Screenshot or PDF of the transfer"
        hint="Optional. PDF, PNG, JPEG or WebP, up to 5 MB."
        type="file"
        accept={ACCEPT}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        error={shown.file}
      />
      <div>
        <Button type="submit" loading={send.pending} loadingText="Sending…">
          Submit payment details
        </Button>
      </div>
    </form>
  );
}
