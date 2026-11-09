'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Facts,
  Input,
  Loadable,
  Money,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import {
  getFinancialSummary,
  getPayout,
  getTeacherStatement,
  listOpenConcerns,
  recordAdjustment,
  recordPayout,
  resolvePayoutConcern,
  type CurrencyBalance,
  type CurrencyFinancialSummary,
  type LedgerEntry,
  type OpenConcern,
  type Payout,
  type TeacherSale,
} from '@/lib/api/admin-money';
import {
  formatAgeHours,
  formatBps,
  parsePositiveMajorToMinor,
  parseSignedMajorToMinor,
  todayIso,
} from '@/lib/admin/format';
import { formatDate } from '@/lib/format';
import { minorToMajorInput, minorUnitExponent } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { formatDateTime, MutationStatus, useMutation } from '../kit';
import { humanize } from '@/lib/format';

// ── #104 Financial summary by period ──

const SUMMARY_ROWS: Array<[keyof CurrencyFinancialSummary, string]> = [
  ['confirmedSalesGrossMinor', 'Confirmed sales (gross)'],
  ['commissionRetainedMinor', 'Commission retained'],
  ['teacherEarningsMinor', 'Teacher earnings'],
  ['refundsMinor', 'Refunds paid to students'],
  ['teacherRefundDebitsMinor', 'Teacher refund debits'],
  ['adjustmentsMinor', 'Manual adjustments'],
  ['payoutsMinor', 'Paid out to teachers'],
  ['periodNetLiabilityChangeMinor', 'Change in amount owed to teachers'],
  ['outstandingLiabilityMinor', 'Owed to teachers at period end'],
];

export function FinanceSummaryScreen() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState<{ from?: string; to?: string }>({});
  const summary = useApi(`finance:${JSON.stringify(query)}`, (signal) =>
    getFinancialSummary(query, signal),
  );
  return (
    <>
      <PageHeader
        title="Financial summary"
        description="Sales, commission, refunds, adjustments and payouts by period (UTC dates, inclusive)."
      />
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ from: from || undefined, to: to || undefined });
        }}
      >
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button type="submit" size="sm">
          Show
        </Button>
      </form>
      <Loadable state={summary} what="the summary">
        {(data) => (
          <>
            <p className="muted">
              {data.period.from || data.period.to
                ? `From ${data.period.from ?? 'the start'} to ${data.period.to ?? 'today'}.`
                : 'All time.'}
            </p>
            {data.currencies.length === 0 && <p>No money has moved in this period.</p>}
            {data.currencies.map((c) => (
              <Section key={c.currency} title={c.currency}>
                <Facts
                  items={[
                    ['Confirmed sales', c.confirmedSalesCount],
                    ['Refunds', c.refundsCount],
                    ['Payouts', c.payoutsCount],
                  ]}
                />
                <Table<[keyof CurrencyFinancialSummary, string]>
                  caption={`${c.currency} totals`}
                  hideCaption
                  rows={SUMMARY_ROWS}
                  rowKey={([key]) => key}
                  columns={[
                    { key: 'label', header: 'Line', rowHeader: true, cell: ([, label]) => label },
                    {
                      key: 'value',
                      header: 'Amount',
                      numeric: true,
                      cell: ([key]) => <Money minor={String(c[key])} currency={c.currency} />,
                    },
                  ]}
                />
              </Section>
            ))}
          </>
        )}
      </Loadable>
    </>
  );
}

// ── #106 Open payout concerns with ageing ──

export function ConcernsScreen() {
  const concerns = useApi('concerns', (signal) => listOpenConcerns(signal));
  return (
    <>
      <PageHeader title="Payout concerns" description="Open concerns, oldest first." />
      <Loadable state={concerns} what="concerns">
        {(data) => (
          <>
            <p>
              <strong>{data.count}</strong> open
              {data.oldestAgeHours !== null && (
                <>; the oldest is {formatAgeHours(data.oldestAgeHours)} old</>
              )}
              .
            </p>
            <Table<OpenConcern>
              caption="Open payout concerns"
              hideCaption
              rows={data.items}
              rowKey={(c) => c.id}
              empty="No open concerns."
              columns={[
                {
                  key: 'teacher',
                  header: 'Teacher',
                  rowHeader: true,
                  cell: (c) => (
                    <Link href={`/admin/teachers/${c.teacher.id}`}>
                      {c.teacher.fullName || c.teacher.email}
                    </Link>
                  ),
                },
                {
                  key: 'payout',
                  header: 'Payout',
                  cell: (c) => (
                    <Link href={`/admin/payouts/${c.payoutId}`}>
                      <Money
                        minor={c.payout.amountMinor}
                        currency={c.payout.ledgerEntries[0]?.currency ?? 'PKR'}
                      />{' '}
                      on {formatDate(c.payout.transferDate)}
                    </Link>
                  ),
                },
                { key: 'reason', header: 'Concern', cell: (c) => c.reason },
                {
                  key: 'age',
                  header: 'Age',
                  numeric: true,
                  cell: (c) => formatAgeHours(c.ageHours),
                },
              ]}
            />
          </>
        )}
      </Loadable>
    </>
  );
}

// ── #105 Per-teacher statement, #83 adjustments, #85 record payout ──

export function TeacherStatementScreen({ teacherId }: { teacherId: string }) {
  const statement = useApi(`statement:${teacherId}`, (signal) =>
    getTeacherStatement(teacherId, signal),
  );
  return (
    <Loadable state={statement} what="the statement">
      {(s) => (
        <>
          <PageHeader
            title={`Statement: ${s.teacher.fullName || s.teacher.email}`}
            description={
              <>
                <Link href={`/admin/users/${teacherId}`}>Account</Link> ·{' '}
                <Link href={`/admin/teachers/${teacherId}/profile`}>Public profile</Link>
              </>
            }
          />
          <Section title="Balance">
            <BalanceTable balances={s.balances} />
          </Section>
          <div className={styles.grid}>
            <RecordPayoutForm
              teacherId={teacherId}
              balances={s.balances}
              onRecorded={statement.reload}
            />
            <AdjustmentForm teacherId={teacherId} onRecorded={statement.reload} />
          </div>
          <Section title={`Payouts (${s.payouts.count})`}>
            <Table<Payout>
              caption="Payouts"
              hideCaption
              rows={s.payouts.items}
              rowKey={(p) => p.id}
              empty="No payouts yet."
              columns={[
                {
                  key: 'date',
                  header: 'Transfer date',
                  rowHeader: true,
                  cell: (p) => (
                    <Link href={`/admin/payouts/${p.id}`}>{formatDate(p.transferDate)}</Link>
                  ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  numeric: true,
                  cell: (p) => (
                    <Money
                      minor={p.amountMinor}
                      currency={p.ledgerEntries?.[0]?.currency ?? 'PKR'}
                    />
                  ),
                },
                { key: 'tx', header: 'Transaction', cell: (p) => p.transactionId },
                { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
                {
                  key: 'deadline',
                  header: 'Concern window ends',
                  cell: (p) => formatDate(p.disputeDeadline),
                },
              ]}
            />
          </Section>
          <SalesTable title="Confirmed sales" items={s.sales.confirmed.items} />
          <SalesTable title="Pending sales (not yet verified)" items={s.sales.pending.items} />
          <Section title={`Ledger (${s.ledger.count} entries)`}>
            <LedgerTable entries={s.ledger.items} />
          </Section>
        </>
      )}
    </Loadable>
  );
}

function BalanceTable({ balances }: { balances: CurrencyBalance[] }) {
  return (
    <Table<CurrencyBalance>
      caption="Balance by currency"
      hideCaption
      rows={balances}
      rowKey={(b) => b.currency}
      empty="No ledger entries yet."
      columns={[
        { key: 'currency', header: 'Currency', rowHeader: true, cell: (b) => b.currency },
        {
          key: 'earnings',
          header: 'Earnings',
          numeric: true,
          cell: (b) => <Money minor={b.earningsMinor} currency={b.currency} />,
        },
        {
          key: 'refunds',
          header: 'Refunds',
          numeric: true,
          cell: (b) => <Money minor={b.refundsMinor} currency={b.currency} />,
        },
        {
          key: 'adjustments',
          header: 'Adjustments',
          numeric: true,
          cell: (b) => <Money minor={b.adjustmentsMinor} currency={b.currency} />,
        },
        {
          key: 'payouts',
          header: 'Payouts',
          numeric: true,
          cell: (b) => <Money minor={b.payoutsMinor} currency={b.currency} />,
        },
        {
          key: 'balance',
          header: 'Owed now',
          numeric: true,
          cell: (b) => (
            <strong>
              <Money minor={b.balanceMinor} currency={b.currency} />
            </strong>
          ),
        },
      ]}
    />
  );
}

function SalesTable({ title, items }: { title: string; items: TeacherSale[] }) {
  return (
    <Section title={`${title} (${items.length})`}>
      <Table<TeacherSale>
        caption={title}
        hideCaption
        rows={items}
        rowKey={(i) => i.id}
        empty="None."
        columns={[
          {
            key: 'order',
            header: 'Order',
            rowHeader: true,
            cell: (i) => <Link href={`/admin/orders/${i.orderId}`}>{i.paymentReference}</Link>,
          },
          { key: 'course', header: 'Course', cell: (i) => i.courseTitle },
          {
            key: 'price',
            header: 'Price',
            numeric: true,
            cell: (i) => <Money minor={i.priceMinor} currency={i.currency} />,
          },
          {
            key: 'rate',
            header: 'Commission',
            numeric: true,
            cell: (i) => formatBps(i.commissionRateBps),
          },
          {
            key: 'net',
            header: 'Teacher',
            numeric: true,
            cell: (i) => <Money minor={i.netTeacherMinor} currency={i.currency} />,
          },
          {
            key: 'date',
            header: 'Verified',
            cell: (i) => formatDate(i.orderVerifiedAt) || humanize(i.orderStatus),
          },
        ]}
      />
    </Section>
  );
}

function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  return (
    <Table<LedgerEntry>
      caption="Ledger entries"
      hideCaption
      rows={entries}
      rowKey={(e) => e.id}
      empty="No entries."
      columns={[
        { key: 'date', header: 'Date', cell: (e) => formatDateTime(e.createdAt) },
        { key: 'type', header: 'Type', rowHeader: true, cell: (e) => humanize(e.type) },
        { key: 'desc', header: 'Description', cell: (e) => e.description },
        {
          key: 'amount',
          header: 'Amount',
          numeric: true,
          cell: (e) => <Money minor={e.amountMinor} currency={e.currency} />,
        },
      ]}
    />
  );
}

/** #85: record a transfer already made to the teacher. */
function RecordPayoutForm({
  teacherId,
  balances,
  onRecorded,
}: {
  teacherId: string;
  balances: CurrencyBalance[];
  onRecorded: () => void;
}) {
  const first = balances[0];
  const [currency, setCurrency] = useState(first?.currency ?? 'PKR');
  const [amount, setAmount] = useState(
    first && !first.balanceMinor.startsWith('-') && first.balanceMinor !== '0'
      ? minorToMajorInput(first.balanceMinor, minorUnitExponent(first.currency))
      : '',
  );
  const [transactionId, setTransactionId] = useState('');
  const [method, setMethod] = useState('');
  const [transferDate, setTransferDate] = useState(todayIso());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = currency.trim().toUpperCase();
    const amountMinor = parsePositiveMajorToMinor(amount, code);
    if (!amountMinor) {
      setError('Enter the amount paid, above zero.');
      return;
    }
    setError(null);
    const ok = await mutation.run(
      () =>
        recordPayout(teacherId, {
          amountMinor,
          currency: code,
          transactionId: transactionId.trim(),
          transferDate,
          method: method.trim() || undefined,
          periodStart: periodStart || undefined,
          periodEnd: periodEnd || undefined,
        }),
      'Payout recorded. The teacher can raise a concern within the window.',
    );
    if (ok) {
      setTransactionId('');
      onRecorded();
    }
  }

  return (
    <Section title="Record a payout">
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.filters}>
          <Input
            label="Amount paid"
            inputMode="decimal"
            value={amount}
            error={error}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <Input
            label="Bank transaction ID"
            required
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
          <Input
            label="Method (optional)"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
          <Input
            label="Transfer date"
            type="date"
            required
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <Input
            label="Sales from (optional)"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
          <Input
            label="Sales to (optional)"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Record payout
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** #83: a signed manual credit or debit on the teacher's ledger, with a reason. */
function AdjustmentForm({ teacherId, onRecorded }: { teacherId: string; onRecorded: () => void }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const code = currency.trim().toUpperCase();
    const amountMinor = parseSignedMajorToMinor(amount, code);
    if (!amountMinor) {
      setError('Enter a non-zero amount; negative for a debit.');
      return;
    }
    setError(null);
    const ok = await mutation.run(
      () => recordAdjustment(teacherId, { amountMinor, currency: code, reason: reason.trim() }),
      'Adjustment recorded.',
    );
    if (ok) {
      setAmount('');
      setReason('');
      onRecorded();
    }
  }

  return (
    <Section title="Manual adjustment">
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.filters}>
          <Input
            label="Amount"
            hint="Positive credits the teacher; negative (e.g. -500) debits."
            value={amount}
            error={error}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Currency"
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>
        <Textarea
          label="Reason"
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Record adjustment
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ── #86–#89 Payout detail and concern resolution ──

export function PayoutDetailScreen({ payoutId }: { payoutId: string }) {
  const detail = useApi(`payout:${payoutId}`, (signal) => getPayout(payoutId, signal));
  return (
    <Loadable state={detail} what="the payout">
      {({ payout, coveredSales }) => {
        const currency = payout.ledgerEntries?.[0]?.currency ?? 'PKR';
        const open = (payout.disputes ?? []).filter((d) => d.status === 'OPEN');
        return (
          <>
            <PageHeader
              title="Payout"
              description={
                payout.teacher && (
                  <Link href={`/admin/teachers/${payout.teacherId}`}>
                    {payout.teacher.fullName || payout.teacher.email}
                  </Link>
                )
              }
              actions={<StatusBadge status={payout.status} />}
            />
            <Section title="Transfer">
              <Facts
                items={[
                  ['Amount', <Money key="a" minor={payout.amountMinor} currency={currency} />],
                  ['Transfer date', formatDate(payout.transferDate)],
                  ['Transaction ID', payout.transactionId],
                  ['Method', payout.method],
                  [
                    'Sales period',
                    payout.periodStart || payout.periodEnd
                      ? `${formatDate(payout.periodStart) || '…'} to ${formatDate(payout.periodEnd) || '…'}`
                      : null,
                  ],
                  ['Recorded', formatDateTime(payout.recordedAt)],
                  ['Concern window ends', formatDateTime(payout.disputeDeadline)],
                  ['Accepted', formatDateTime(payout.acceptedAt)],
                ]}
              />
            </Section>
            <Section title="Concerns">
              {(payout.disputes ?? []).length === 0 ? (
                <p className="muted">The teacher has not raised a concern.</p>
              ) : (
                <ul className={styles.list}>
                  {(payout.disputes ?? []).map((d) => (
                    <li key={d.id}>
                      <StatusBadge status={d.status} /> {formatDateTime(d.createdAt)}: “{d.reason}”
                      {d.resolutionNotes && (
                        <>
                          {' '}
                          · resolved {formatDateTime(d.resolvedAt)} by{' '}
                          {d.resolvedBy?.email ?? 'an admin'}: “{d.resolutionNotes}”
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {open.length > 0 && (
                <ResolveConcernForm
                  payoutId={payout.id}
                  currency={currency}
                  onResolved={detail.reload}
                />
              )}
            </Section>
            <Section title={`Sales covered (${coveredSales.length})`}>
              <Table<(typeof coveredSales)[number]>
                caption="Sales covered by this payout"
                hideCaption
                rows={coveredSales}
                rowKey={(s) => s.orderItemId}
                empty="No sales listed for this payout."
                columns={[
                  {
                    key: 'order',
                    header: 'Order',
                    rowHeader: true,
                    cell: (s) => (
                      <Link href={`/admin/orders/${s.orderId}`}>{s.paymentReference}</Link>
                    ),
                  },
                  { key: 'course', header: 'Course', cell: (s) => s.courseTitle },
                  {
                    key: 'net',
                    header: 'Teacher',
                    numeric: true,
                    cell: (s) => <Money minor={s.netTeacherMinor} currency={s.currency} />,
                  },
                  { key: 'verified', header: 'Verified', cell: (s) => formatDate(s.verifiedAt) },
                ]}
              />
            </Section>
          </>
        );
      }}
    </Loadable>
  );
}

/** #89: resolve with written notes and, optionally, a signed ledger adjustment. */
function ResolveConcernForm({
  payoutId,
  currency,
  onResolved,
}: {
  payoutId: string;
  currency: string;
  onResolved: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let adjustmentAmountMinor: string | undefined;
    if (amount.trim()) {
      const parsed = parseSignedMajorToMinor(amount, currency);
      if (!parsed) {
        setError('Enter a non-zero amount, or leave it empty for no adjustment.');
        return;
      }
      adjustmentAmountMinor = parsed;
    }
    setError(null);
    const ok = await mutation.run(
      () =>
        resolvePayoutConcern(payoutId, {
          resolutionNotes: notes.trim(),
          adjustmentAmountMinor,
          adjustmentCurrency: adjustmentAmountMinor ? currency : undefined,
        }),
      'Concern resolved. The teacher sees your notes.',
    );
    if (ok) onResolved();
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Resolve concern">
      <Textarea
        label="Resolution notes"
        required
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Input
        label={`Adjustment (${currency}, optional)`}
        hint="Positive credits the teacher; negative debits."
        value={amount}
        error={error}
        onChange={(e) => setAmount(e.target.value)}
      />
      <MutationStatus mutation={mutation} />
      <div className={styles.actions}>
        <Button type="submit" size="sm" loading={mutation.pending}>
          Resolve concern
        </Button>
      </div>
    </form>
  );
}
