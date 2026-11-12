'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Loadable,
  PageHeader,
  Section,
  SplitLayout,
  StatGrid,
  StatTile,
  Table,
  Textarea,
  type BadgeTone,
  type Column,
  Money,
  Skeleton,
} from '@/components/ui';
import {
  canRaiseConcern,
  earningsApi,
  payoutCurrency,
  type LedgerEntry,
  type LedgerEntryType,
  type PayoutStatus,
  type PayoutSummary,
  type SaleItem,
  type SalesTotals,
} from '@/lib/api/earnings';
import { errorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/use-mutation';
import { formatDate, formatPeriod } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@tanstack/react-query';
import styles from './Teacher.module.css';

/** 1250 → "12.5%". Integer maths on basis points. */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const rest = String(Math.abs(bps % 100))
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${whole}${rest ? `.${rest}` : ''}%`;
}

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Paid, open for questions', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  DISPUTED: { label: 'Concern raised', tone: 'warning' },
  RESOLVED: { label: 'Concern resolved', tone: 'neutral' },
};

const ENTRY_LABEL: Record<LedgerEntryType, string> = {
  EARNING: 'Sale',
  PAYOUT: 'Payout',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
};

const saleColumns: Array<Column<SaleItem>> = [
  { key: 'course', header: 'Course', rowHeader: true, cell: (s) => s.courseTitle },
  { key: 'ref', header: 'Order', cell: (s) => <code>{s.paymentReference}</code> },
  {
    key: 'date',
    header: 'Date',
    cell: (s) => formatDate(s.orderVerifiedAt ?? s.orderCreatedAt),
  },
  {
    key: 'gross',
    header: 'Price',
    numeric: true,
    cell: (s) => <Money minor={s.priceMinor} currency={s.currency} />,
  },
  {
    key: 'commission',
    header: 'Commission',
    numeric: true,
    cell: (s) =>
      `${formatMoney(s.commissionMinor, s.currency)} (${formatBps(s.commissionRateBps)})`,
  },
  {
    key: 'net',
    header: 'Your share',
    numeric: true,
    cell: (s) => <Money minor={s.netTeacherMinor} currency={s.currency} />,
  },
];

const ledgerColumns: Array<Column<LedgerEntry>> = [
  { key: 'date', header: 'Date', cell: (e) => formatDate(e.createdAt) },
  { key: 'type', header: 'Type', rowHeader: true, cell: (e) => ENTRY_LABEL[e.type] ?? e.type },
  {
    key: 'desc',
    header: 'Details',
    // "Sale" under a Type of "Sale" says nothing twice.
    cell: (e) =>
      e.description && e.description.toLowerCase() !== (ENTRY_LABEL[e.type] ?? '').toLowerCase()
        ? e.description
        : '—',
  },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    cell: (e) => <Money minor={e.amountMinor} currency={e.currency} />,
  },
];

/** The ledger shows this many rows before "Show more": a busy teacher has thousands. */
const LEDGER_PAGE = 25;

/** Money paid out is stored as a negative ledger amount; the tile says how much, not which way. */
const absMinor = (minor: string) => minor.replace(/^-/, '');

/** #84: balance, pending vs confirmed sales, statement and payouts (#85–#88). */
export function Earnings() {
  const dashboard = useQuery({
    queryKey: ['earnings'],
    queryFn: ({ signal }) => earningsApi.dashboard(signal),
  });

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Ledger · after commission"
        title="Earnings"
        description="A sale counts once an admin confirms the student’s bank transfer. After each payout you can raise a concern until the date shown on it; after that it is accepted automatically."
      />
      <Loadable state={dashboard} what="your earnings">
        {(data) => {
          const onlyCurrency =
            data.balances.length === 1 ? (data.balances[0]?.currency ?? null) : null;
          const pendingNet = (currency: string) =>
            data.pendingSales.totalsByCurrency.find((t) => t.currency === currency)
              ?.netTeacherMinor ?? '0';
          return (
            <>
              {data.balances.length === 0 ? (
                <p className="muted">
                  No earnings yet. Your share of each sale appears here once its payment is
                  verified.
                </p>
              ) : (
                data.balances.map((b) => (
                  <StatGrid key={b.currency} label={`Balance in ${b.currency}`}>
                    <StatTile label="Owed to you" value={formatMoney(b.balanceMinor, b.currency)} />
                    <StatTile label="Earned" value={formatMoney(b.earningsMinor, b.currency)} />
                    <StatTile
                      tone={pendingNet(b.currency) === '0' ? 'neutral' : 'warning'}
                      label="Pending verification"
                      value={formatMoney(pendingNet(b.currency), b.currency)}
                    />
                    <StatTile
                      label="Paid out"
                      value={formatMoney(absMinor(b.payoutsMinor), b.currency)}
                      note={`Refunds ${formatMoney(b.refundsMinor, b.currency)} · adjustments ${formatMoney(b.adjustmentsMinor, b.currency)}`}
                    />
                  </StatGrid>
                ))
              )}

              {data.ledgerEntries.length === 0 &&
              data.payouts.length === 0 &&
              data.pendingSales.items.length === 0 &&
              data.confirmedSales.items.length === 0 ? (
                <p className="muted">
                  No sales yet. Earnings appear here once an admin confirms a student’s payment.
                </p>
              ) : (
                <SplitLayout
                  main={
                    <>
                      <LedgerSection entries={data.ledgerEntries} />
                      <SalesSection
                        title="Pending sales"
                        intro="Orders whose payment is not verified yet."
                        items={data.pendingSales.items}
                        totals={data.pendingSales.totalsByCurrency}
                      />
                      <SalesSection
                        title="Confirmed sales"
                        intro="Verified payments. Your share is in your balance."
                        items={data.confirmedSales.items}
                        totals={data.confirmedSales.totalsByCurrency}
                      />
                    </>
                  }
                  aside={
                    <Section title="Payouts">
                      {data.payouts.length === 0 ? (
                        <p className="muted">No payouts yet.</p>
                      ) : (
                        <ul className={styles.payouts}>
                          {data.payouts.map((p) => (
                            <li key={p.id}>
                              <PayoutCard
                                payout={p}
                                currency={payoutCurrency(p.id, data.ledgerEntries, onlyCurrency)}
                                onChanged={() => void dashboard.refetch()}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </Section>
                  }
                />
              )}
            </>
          );
        }}
      </Loadable>
    </div>
  );
}

/** The statement, newest first, 25 at a time. */
function LedgerSection({ entries }: { entries: LedgerEntry[] }) {
  const [shown, setShown] = useState(LEDGER_PAGE);
  const newestFirst = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Section flush title="Statement · newest first">
      <Table
        caption="Every entry in your account, newest first"
        hideCaption
        columns={ledgerColumns}
        rows={newestFirst.slice(0, shown)}
        rowKey={(e) => e.id}
        empty="No entries yet."
      />
      {newestFirst.length > shown && (
        <p className={styles.salesIntro}>
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + LEDGER_PAGE)}>
            Show {Math.min(LEDGER_PAGE, newestFirst.length - shown)} more
          </Button>
        </p>
      )}
    </Section>
  );
}

function SalesSection({
  title,
  intro,
  items,
  totals,
}: {
  title: string;
  intro: string;
  items: SaleItem[];
  totals: SalesTotals[];
}) {
  return (
    <Section flush title={title} aria-label={title}>
      <div className={styles.salesIntro}>
        <p className="muted">{intro}</p>
        {totals.map((t) => (
          <p key={t.currency}>
            {t.itemCount} {t.itemCount === 1 ? 'sale' : 'sales'}: your share{' '}
            <strong className="mono">
              <Money minor={t.netTeacherMinor} currency={t.currency} />
            </strong>{' '}
            of{' '}
            <span className="mono">
              <Money minor={t.grossMinor} currency={t.currency} />
            </span>
          </p>
        ))}
      </div>
      <Table
        caption={`${title}, by order`}
        hideCaption
        columns={saleColumns}
        rows={items}
        rowKey={(s) => s.id}
        empty="No sales here yet."
      />
    </Section>
  );
}

function PayoutCard({
  payout,
  currency,
  onChanged,
}: {
  payout: PayoutSummary;
  currency: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const status = PAYOUT_STATUS[payout.status];
  const panelId = `payout-${payout.id}`;
  return (
    <article className={styles.payoutRow} aria-labelledby={`${panelId}-title`}>
      <div className={styles.titleRow}>
        <h3 id={`${panelId}-title`} className={styles.panelTitle}>
          <Money minor={payout.amountMinor} currency={currency} />{' '}
          <span className="muted">on {formatDate(payout.transferDate ?? payout.recordedAt)}</span>
        </h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className={styles.facts}>
        {payout.method && (
          <div>
            <dt>Method</dt>
            <dd>{payout.method}</dd>
          </div>
        )}
        {payout.transactionId && (
          <div>
            <dt>Transaction</dt>
            <dd>
              <code>{payout.transactionId}</code>
            </dd>
          </div>
        )}
        {payout.periodStart && (
          <div>
            <dt>Covers</dt>
            <dd>{formatPeriod(payout.periodStart, payout.periodEnd)}</dd>
          </div>
        )}
        {payout.status === 'PENDING' && (
          <div>
            <dt>Questions until</dt>
            <dd>{formatDate(payout.disputeDeadline)}</dd>
          </div>
        )}
      </dl>
      <div>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide details' : 'Details'}
        </Button>
      </div>
      {open && (
        <div id={panelId}>
          <PayoutDetails payout={payout} onChanged={onChanged} />
        </div>
      )}
    </article>
  );
}

function PayoutDetails({ payout, onChanged }: { payout: PayoutSummary; onChanged: () => void }) {
  const detail = useQuery({
    queryKey: ['payout', payout.id],
    queryFn: ({ signal }) => earningsApi.payout(payout.id, signal),
  });
  if (detail.status === 'pending') return <Skeleton label="Loading…" />;
  if (detail.status === 'error') return <Alert tone="danger">{errorMessage(detail.error)}</Alert>;
  const { coveredSales, payout: full } = detail.data;
  return (
    <div className="stack">
      <Table
        caption="Sales this payout covers"
        columns={[
          { key: 'course', header: 'Course', rowHeader: true, cell: (s) => s.courseTitle },
          { key: 'ref', header: 'Order', cell: (s) => <code>{s.paymentReference}</code> },
          {
            key: 'net',
            header: 'Your share',
            numeric: true,
            cell: (s) => <Money minor={s.netTeacherMinor} currency={s.currency} />,
          },
        ]}
        rows={coveredSales}
        rowKey={(s) => s.orderItemId}
        empty="No itemised sales recorded for this payout."
      />
      {full.disputes.map((d) => (
        <Alert
          key={d.id}
          tone={d.status === 'OPEN' ? 'warning' : 'info'}
          title={d.status === 'OPEN' ? 'Your concern (open)' : 'Your concern (resolved)'}
        >
          <p>{d.reason}</p>
          {d.resolutionNotes && <p>Resolution: {d.resolutionNotes}</p>}
        </Alert>
      ))}
      {canRaiseConcern(payout) && (
        <ConcernForm
          payoutId={payout.id}
          onRaised={() => {
            void detail.refetch();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ConcernForm({ payoutId, onRaised }: { payoutId: string; onRaised: () => void }) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();
  const raise = useMutation();
  const error = localError ?? raise.error ?? undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setLocalError('Describe what looks wrong');
      return;
    }
    setLocalError(undefined);
    await raise.run(async () => {
      await earningsApi.raiseConcern(payoutId, reason.trim());
      onRaised();
    });
  }

  return (
    <form className="stack" noValidate onSubmit={submit} aria-label="Payout concern">
      <Textarea
        label="Raise a concern"
        hint="For example a missing sale or a wrong amount. An admin will look into it."
        maxLength={2000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
      />
      <div>
        <Button type="submit" size="sm" loading={raise.pending} loadingText="Sending…">
          Send concern
        </Button>
      </div>
    </form>
  );
}
