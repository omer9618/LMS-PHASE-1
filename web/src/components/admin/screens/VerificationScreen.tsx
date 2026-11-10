'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  type Column,
  Facts,
  Input,
  Loadable,
  Money,
  PageHeader,
  Pager,
  Section,
  Select,
  SplitLayout,
  StatGrid,
  StatTile,
  Table,
  Textarea,
} from '@/components/ui';
import {
  adminFinanceApi,
  REJECTION_REASONS,
  type MismatchAction,
  type PaymentProof,
  type RejectionReason,
  type VerificationQueueEntry,
} from '@/lib/api/admin-finance';
import { formatAgeHours, formatAgeMinutes, todayIso } from '@/lib/format';
import { absMinor, checkReceived, MISMATCH_LABELS } from '@/lib/admin/verification';
import { formatMoney, minorToMajorInput, minorUnitExponent, parseMajorToMinor } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { MutationStatus, useMutation } from '../kit';
import { formatDateTime } from '@/lib/format';
import { humanize } from '@/lib/format';
import { confirmPaymentForm, rejectPaymentForm } from '@/lib/forms/admin';
import { firstError, validateForm } from '@/lib/zod-form';

const LIMIT = 20;

/** #63, #67: orders waiting for verification, oldest first, with the queue's metrics. */
export function VerificationScreen() {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const metrics = useApi(`verification-metrics:${refresh}`, (signal) =>
    adminFinanceApi.getVerificationMetrics(signal),
  );
  const queue = useApi(`verification-queue:${offset}:${refresh}`, (signal) =>
    adminFinanceApi.getVerificationQueue({ limit: LIMIT, offset }, signal),
  );
  const reload = () => setRefresh((n) => n + 1);

  return (
    <>
      <PageHeader
        eyebrow="Orders · proof submitted · oldest first"
        title="Payment verification"
        description="Match each transfer in the bank statement by transaction ID and amount before confirming. Never confirm from the screenshot alone."
        actions={<OrderLookup />}
      />
      <Loadable state={metrics} what="queue metrics">
        {(m) => (
          <StatGrid label="Queue metrics">
            <StatTile label="In queue" value={m.queueSize} />
            <StatTile
              label="Oldest waiting"
              value={formatAgeMinutes(m.oldestWaitingMinutes)}
              tone={m.oldestOverTurnaround ? 'danger' : 'neutral'}
            />
            <StatTile
              label={`Past ${formatAgeHours(m.turnaroundHours)} turnaround`}
              value={m.overTurnaroundCount}
              tone={m.overTurnaroundCount > 0 ? 'danger' : 'neutral'}
            />
          </StatGrid>
        )}
      </Loadable>
      <Loadable state={queue} what="the queue">
        {(page) => {
          if (page.items.length === 0) return <p>Nothing is waiting for verification.</p>;
          const selected = page.items.find((e) => e.orderId === selectedId) ?? page.items[0]!;
          return (
            <SplitLayout
              main={
                <>
                  <Section flush aria-label="Queue">
                    <Table
                      caption="Orders waiting for verification, oldest first"
                      hideCaption
                      columns={queueColumns(selected.orderId, setSelectedId)}
                      rows={page.items}
                      rowKey={(e) => e.orderId}
                    />
                  </Section>
                  <Pager total={page.total} limit={LIMIT} offset={offset} onChange={setOffset} />
                </>
              }
              aside={<ReviewPanel key={selected.orderId} entry={selected} onDecided={reload} />}
            />
          );
        }}
      </Loadable>
    </>
  );
}

/** The flags a queue row can carry, as words, most serious first. */
export function queueFlags(
  entry: VerificationQueueEntry,
): Array<{ label: string; tone: BadgeTone }> {
  const flags: Array<{ label: string; tone: BadgeTone }> = [];
  if (entry.claimed.mismatch) {
    const short = entry.claimed.differenceMinor?.startsWith('-') ?? false;
    flags.push({ label: short ? 'Amount short' : 'Amount differs', tone: 'danger' });
  }
  if (entry.duplicateTransactionIdWarnings.length > 0) {
    flags.push({ label: 'Txn ID used before', tone: 'warning' });
  }
  if (entry.overTurnaround) flags.push({ label: 'Past turnaround', tone: 'danger' });
  return flags;
}

function queueColumns(
  selectedId: string,
  onSelect: (orderId: string) => void,
): Array<Column<VerificationQueueEntry>> {
  return [
    {
      key: 'ref',
      header: 'Reference',
      rowHeader: true,
      cell: (e) => (
        <button
          type="button"
          className={styles.rowButton}
          aria-pressed={e.orderId === selectedId}
          onClick={() => onSelect(e.orderId)}
        >
          {e.paymentReference}
        </button>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      cell: (e) => (
        <span className={styles.stacked}>
          <b>{e.student.fullName || e.student.email}</b>
          <span className="muted">
            {e.items.length === 1 ? e.items[0]!.courseTitle : `${e.items.length} courses`}
          </span>
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      cell: (e) => formatMoney(e.totalMinor, e.currency),
    },
    {
      key: 'claimed',
      header: 'Claimed',
      numeric: true,
      cell: (e) =>
        e.claimed.claimedMinor ? (
          <span className={e.claimed.mismatch ? styles.bad : undefined}>
            {formatMoney(e.claimed.claimedMinor, e.currency)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      cell: (e) => (
        <span className={e.overTurnaround ? styles.bad : 'mono'}>
          {formatAgeMinutes(e.waitingMinutes)}
        </span>
      ),
    },
    {
      key: 'flags',
      header: 'Flags',
      cell: (e) => (
        <span className={styles.flags}>
          {queueFlags(e).map((f) => (
            <Badge key={f.label} tone={f.tone}>
              {f.label}
            </Badge>
          ))}
        </span>
      ),
    },
  ];
}

/** The selected order: what the student sent, warnings, and the decision form. */
function ReviewPanel({
  entry,
  onDecided,
}: {
  entry: VerificationQueueEntry;
  onDecided: () => void;
}) {
  return (
    <Section raised title={`Review ${entry.paymentReference}`}>
      <Facts
        columns="one"
        items={[
          [
            'Student',
            <Link key="s" href={`/admin/users/${entry.student.id}`}>
              {entry.student.fullName || entry.student.email}
            </Link>,
          ],
          [
            'Courses',
            entry.items.map((i) => `${i.courseTitle} (${i.teacherName ?? 'teacher'})`).join('; '),
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
      const checked = validateForm(rejectPaymentForm, { reason, notes });
      if (!checked.ok) {
        setError(firstError(checked.errors));
        return;
      }
      const ok = await mutation.run(
        () => adminFinanceApi.rejectPayment(orderId, checked.data),
        'Payment rejected. The student has been told why.',
      );
      if (ok) onDecided();
      return;
    }
    const checked = validateForm(confirmPaymentForm(totalMinor, currency), {
      received,
      valueDate,
      action,
      notes,
    });
    if (!checked.ok) {
      setError(firstError(checked.errors));
      return;
    }
    const body = checked.data;
    const ok = await mutation.run(
      () => adminFinanceApi.confirmPayment(orderId, body),
      body.mismatchAction === undefined || body.mismatchAction === 'CONFIRM_ANYWAY'
        ? 'Payment confirmed. Access granted and earnings recorded.'
        : body.mismatchAction === 'REQUEST_TOP_UP'
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
