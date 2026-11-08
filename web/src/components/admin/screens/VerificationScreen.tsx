'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Input, Select, Textarea } from '@/components/ui';
import {
  confirmPayment,
  getVerificationMetrics,
  getVerificationQueue,
  rejectPayment,
  REJECTION_REASONS,
  type MismatchAction,
  type PaymentProof,
  type RejectionReason,
  type VerificationQueueEntry,
} from '@/lib/api/admin-money';
import { formatAgeHours, formatAgeMinutes, todayIso } from '@/lib/admin/format';
import { absMinor, checkReceived, MISMATCH_LABELS } from '@/lib/admin/verification';
import { formatMoney, minorToMajorInput, minorUnitExponent, parseMajorToMinor } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import {
  Facts,
  formatDateTime,
  humanize,
  Loadable,
  Money,
  MutationStatus,
  PageHeader,
  Pager,
  Section,
  useMutation,
} from '../kit';

const LIMIT = 20;

/** #63, #67: orders waiting for verification, oldest first, with the queue's metrics. */
export function VerificationScreen() {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const metrics = useApi(`verification-metrics:${refresh}`, (signal) =>
    getVerificationMetrics(signal),
  );
  const queue = useApi(`verification-queue:${offset}:${refresh}`, (signal) =>
    getVerificationQueue({ limit: LIMIT, offset }, signal),
  );
  const reload = () => setRefresh((n) => n + 1);

  return (
    <>
      <PageHeader
        title="Payment verification"
        description="Check each transfer against the bank before granting access."
        actions={<OrderLookup />}
      />
      <Loadable state={metrics} what="queue metrics">
        {(m) => (
          <ul className={styles.tiles} aria-label="Queue metrics">
            <li className={styles.tile}>
              <span className={styles.tileValue}>{m.queueSize}</span>
              <span className={styles.tileLabel}>Waiting</span>
            </li>
            <li className={styles.tile}>
              <span className={styles.tileValue}>{formatAgeMinutes(m.oldestWaitingMinutes)}</span>
              <span className={styles.tileLabel}>
                Oldest waiting{m.oldestOverTurnaround ? ' (past turnaround)' : ''}
              </span>
            </li>
            <li className={styles.tile}>
              <span className={styles.tileValue}>{m.overTurnaroundCount}</span>
              <span className={styles.tileLabel}>
                Past the {formatAgeHours(m.turnaroundHours)} turnaround
              </span>
            </li>
          </ul>
        )}
      </Loadable>
      <Loadable state={queue} what="the queue">
        {(page) => (
          <>
            {page.items.length === 0 && <p>Nothing is waiting for verification.</p>}
            {page.items.map((entry) => (
              <QueueEntry key={entry.orderId} entry={entry} onDecided={reload} />
            ))}
            <Pager total={page.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Loadable>
    </>
  );
}

export function OrderLookup() {
  const router = useRouter();
  const [id, setId] = useState('');
  return (
    <form
      className={styles.filters}
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) router.push(`/admin/orders/${encodeURIComponent(id.trim())}`);
      }}
    >
      <Input label="Order ID" value={id} onChange={(e) => setId(e.target.value)} />
      <Button type="submit" size="sm" variant="secondary">
        Open
      </Button>
    </form>
  );
}

export function ProofList({ proofs, currency }: { proofs: PaymentProof[]; currency: string }) {
  if (proofs.length === 0) return <p className="muted">No proofs.</p>;
  return (
    <ul className={styles.list}>
      {proofs.map((p) => (
        <li key={p.id}>
          Transaction <code>{p.transactionId}</code>
          {p.amountClaimedMinor && (
            <> · claims {formatMoney(p.amountClaimedMinor, currency)}</>
          )} · {formatDateTime(p.submittedAt)}
          {p.fileUrl && (
            <>
              {' '}
              ·{' '}
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer">
                View proof file
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function QueueEntry({
  entry,
  onDecided,
}: {
  entry: VerificationQueueEntry;
  onDecided: () => void;
}) {
  return (
    <Section
      title={
        <>
          <Link href={`/admin/orders/${entry.orderId}`}>{entry.paymentReference}</Link>{' '}
          {entry.overTurnaround && <Badge tone="danger">Past turnaround</Badge>}
          {entry.claimed.mismatch && <Badge tone="warning">Claimed amount differs</Badge>}
        </>
      }
    >
      <Facts
        items={[
          [
            'Student',
            <Link key="s" href={`/admin/users/${entry.student.id}`}>
              {entry.student.fullName || entry.student.email}
            </Link>,
          ],
          ['Order total', <Money key="t" minor={entry.totalMinor} currency={entry.currency} />],
          [
            'Student claims',
            entry.claimed.claimedMinor ? (
              <Money minor={entry.claimed.claimedMinor} currency={entry.currency} />
            ) : (
              'No amount given'
            ),
          ],
          ['Waiting', formatAgeMinutes(entry.waitingMinutes)],
          [
            'Courses',
            entry.items.map((i) => `${i.courseTitle} (${i.teacherName ?? 'teacher'})`).join('; '),
          ],
        ]}
      />
      {entry.duplicateTransactionIdWarnings.map((w) => (
        <Alert key={w.transactionId} tone="warning" title="Transaction ID used on another order">
          <p>{w.message}</p>
          <p>
            Also on:{' '}
            {w.conflictingOrderIds.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <Link href={`/admin/orders/${id}`}>{w.conflictingPaymentReferences[i] ?? id}</Link>
              </span>
            ))}
          </p>
        </Alert>
      ))}
      <ProofList proofs={entry.proofs} currency={entry.currency} />
      <DecisionPanel
        orderId={entry.orderId}
        totalMinor={entry.totalMinor}
        currency={entry.currency}
        suggestedMinor={entry.claimed.claimedMinor ?? entry.totalMinor}
        onDecided={onDecided}
      />
    </Section>
  );
}

/** #64–#66: confirm with the amount received and value date (handling a mismatch), or reject. */
export function DecisionPanel({
  orderId,
  totalMinor,
  currency,
  suggestedMinor,
  onDecided,
}: {
  orderId: string;
  totalMinor: string;
  currency: string;
  suggestedMinor: string;
  onDecided: () => void;
}) {
  const exponent = minorUnitExponent(currency);
  const [mode, setMode] = useState<'confirm' | 'reject'>('confirm');
  const [received, setReceived] = useState(minorToMajorInput(suggestedMinor, exponent));
  const [valueDate, setValueDate] = useState(todayIso());
  const [action, setAction] = useState<MismatchAction | ''>('');
  const [reason, setReason] = useState<RejectionReason>('NO_PAYMENT_RECEIVED');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation();

  const receivedMinor = parseMajorToMinor(received, exponent);
  const check =
    receivedMinor && !/^0+$/.test(receivedMinor) ? checkReceived(totalMinor, receivedMinor) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === 'reject') {
      if (reason === 'OTHER' && !notes.trim()) {
        setError('Explain the rejection in the notes when the reason is Other.');
        return;
      }
      const ok = await mutation.run(
        () => rejectPayment(orderId, { rejectionReason: reason, notes: notes.trim() || undefined }),
        'Payment rejected. The student has been told why.',
      );
      if (ok) onDecided();
      return;
    }
    if (!check) {
      setError('Enter the amount received, above zero.');
      return;
    }
    if (check.kind !== 'exact' && !action) {
      setError('The amount differs from the total: choose what to do.');
      return;
    }
    const ok = await mutation.run(
      () =>
        confirmPayment(orderId, {
          amountReceivedMinor: receivedMinor!,
          valueDate,
          mismatchAction: check.kind === 'exact' ? undefined : (action as MismatchAction),
          notes: notes.trim() || undefined,
        }),
      check.kind === 'exact' || action === 'CONFIRM_ANYWAY'
        ? 'Payment confirmed. Access granted and earnings recorded.'
        : action === 'REQUEST_TOP_UP'
          ? 'Top-up requested from the student.'
          : 'Payment rejected.',
    );
    if (ok) onDecided();
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Decision">
      <div className={styles.actions} role="radiogroup" aria-label="Decision">
        <Button
          size="sm"
          variant={mode === 'confirm' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'confirm'}
          onClick={() => setMode('confirm')}
        >
          Confirm received
        </Button>
        <Button
          size="sm"
          variant={mode === 'reject' ? 'danger' : 'secondary'}
          aria-pressed={mode === 'reject'}
          onClick={() => setMode('reject')}
        >
          Reject
        </Button>
      </div>
      {mode === 'confirm' ? (
        <>
          <div className={styles.filters}>
            <Input
              label={`Amount received (${currency})`}
              inputMode="decimal"
              value={received}
              hint="All transfers for this order together, as seen in the bank."
              onChange={(e) => setReceived(e.target.value)}
            />
            <Input
              label="Bank value date"
              type="date"
              max={todayIso()}
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
            />
          </div>
          {check && check.kind !== 'exact' && (
            <>
              <Alert tone="warning" title="Amount mismatch">
                <p>
                  {check.kind === 'short' ? 'Short by' : 'Overpaid by'}{' '}
                  {formatMoney(absMinor(check.differenceMinor), currency)} against a total of{' '}
                  {formatMoney(totalMinor, currency)}.
                </p>
              </Alert>
              <Select
                label="What to do"
                value={action}
                onChange={(e) => setAction(e.target.value as MismatchAction | '')}
              >
                <option value="">Choose…</option>
                {check.actions.map((a) => (
                  <option key={a} value={a}>
                    {MISMATCH_LABELS[a]}
                  </option>
                ))}
              </Select>
            </>
          )}
        </>
      ) : (
        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as RejectionReason)}
        >
          {REJECTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </Select>
      )}
      <Textarea
        label={mode === 'reject' && reason === 'OTHER' ? 'Notes (required)' : 'Notes (optional)'}
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && (
        <Alert tone="danger">
          <p>{error}</p>
        </Alert>
      )}
      <MutationStatus mutation={mutation} />
      <div className={styles.actions}>
        <Button
          type="submit"
          size="sm"
          variant={mode === 'reject' ? 'danger' : 'primary'}
          loading={mutation.pending}
        >
          {mode === 'reject' ? 'Reject payment' : 'Record decision'}
        </Button>
      </div>
    </form>
  );
}
