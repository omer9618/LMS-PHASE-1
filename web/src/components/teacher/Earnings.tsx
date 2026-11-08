'use client';

import { useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Table,
  Textarea,
  type BadgeTone,
  type Column,
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
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useApi } from '@/lib/use-api';
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
    cell: (s) => formatMoney(s.priceMinor, s.currency),
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
    cell: (s) => formatMoney(s.netTeacherMinor, s.currency),
  },
];

const ledgerColumns: Array<Column<LedgerEntry>> = [
  { key: 'date', header: 'Date', cell: (e) => formatDate(e.createdAt) },
  { key: 'type', header: 'Type', rowHeader: true, cell: (e) => ENTRY_LABEL[e.type] ?? e.type },
  { key: 'desc', header: 'Details', cell: (e) => e.description ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    numeric: true,
    cell: (e) => formatMoney(e.amountMinor, e.currency),
  },
];

/** #84: balance, pending vs confirmed sales, statement and payouts (#85–#88). */
export function Earnings() {
  const dashboard = useApi('earnings', (signal) => earningsApi.dashboard(signal));

  if (dashboard.status === 'loading') return <p role="status">Loading your earnings…</p>;
  if (dashboard.status === 'error') {
    return (
      <Alert tone="danger" title="Could not load your earnings">
        <p>{errorMessage(dashboard.error)}</p>
        <Button size="sm" variant="secondary" onClick={dashboard.reload}>
          Try again
        </Button>
      </Alert>
    );
  }

  const data = dashboard.data;
  const onlyCurrency = data.balances.length === 1 ? (data.balances[0]?.currency ?? null) : null;

  return (
    <div className="stack">
      <h1>Earnings</h1>

      <section aria-labelledby="balance-heading" className="stack">
        <h2 id="balance-heading">Balance</h2>
        {data.balances.length === 0 ? (
          <p className="muted">
            No earnings yet. Your share of each sale appears here once its payment is verified.
          </p>
        ) : (
          <div className={styles.grid}>
            {data.balances.map((b) => (
              <div key={b.currency} className={styles.panel}>
                <p className="muted">Owed to you</p>
                <p className={styles.bigNumber}>{formatMoney(b.balanceMinor, b.currency)}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>Earned</dt>
                    <dd>{formatMoney(b.earningsMinor, b.currency)}</dd>
                  </div>
                  <div>
                    <dt>Paid out</dt>
                    <dd>{formatMoney(b.payoutsMinor, b.currency)}</dd>
                  </div>
                  <div>
                    <dt>Refunds</dt>
                    <dd>{formatMoney(b.refundsMinor, b.currency)}</dd>
                  </div>
                  <div>
                    <dt>Adjustments</dt>
                    <dd>{formatMoney(b.adjustmentsMinor, b.currency)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <SalesSection
        id="pending"
        title="Pending sales"
        intro="Orders whose payment is not verified yet. They count once an admin confirms the payment."
        items={data.pendingSales.items}
        totals={data.pendingSales.totalsByCurrency}
      />
      <SalesSection
        id="confirmed"
        title="Confirmed sales"
        intro="Verified payments. Your share is added to your balance."
        items={data.confirmedSales.items}
        totals={data.confirmedSales.totalsByCurrency}
      />

      <section aria-labelledby="payouts-heading" className="stack">
        <h2 id="payouts-heading">Payouts</h2>
        <p className="muted">
          After each payout you have a few days to raise a concern if something looks wrong; after
          that it is accepted automatically.
        </p>
        {data.payouts.length === 0 ? (
          <p className="muted">No payouts yet.</p>
        ) : (
          <ul className={styles.payouts}>
            {data.payouts.map((p) => (
              <li key={p.id}>
                <PayoutCard
                  payout={p}
                  currency={payoutCurrency(p.id, data.ledgerEntries, onlyCurrency)}
                  onChanged={dashboard.reload}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="statement-heading" className="stack">
        <h2 id="statement-heading">Statement</h2>
        <Table
          caption="Every entry in your account, newest last"
          columns={ledgerColumns}
          rows={data.ledgerEntries}
          rowKey={(e) => e.id}
          empty="No entries yet."
        />
      </section>
    </div>
  );
}

function SalesSection({
  id,
  title,
  intro,
  items,
  totals,
}: {
  id: string;
  title: string;
  intro: string;
  items: SaleItem[];
  totals: SalesTotals[];
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="stack">
      <h2 id={`${id}-heading`}>{title}</h2>
      <p className="muted">{intro}</p>
      {totals.length > 0 && (
        <ul className={styles.totals}>
          {totals.map((t) => (
            <li key={t.currency}>
              {t.itemCount} {t.itemCount === 1 ? 'sale' : 'sales'}: your share{' '}
              <strong>{formatMoney(t.netTeacherMinor, t.currency)}</strong> of{' '}
              {formatMoney(t.grossMinor, t.currency)}
            </li>
          ))}
        </ul>
      )}
      <Table
        caption={`${title}, by order`}
        hideCaption
        columns={saleColumns}
        rows={items}
        rowKey={(s) => s.id}
        empty="None."
      />
    </section>
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
    <article className={styles.panel} aria-labelledby={`${panelId}-title`}>
      <div className={styles.titleRow}>
        <h3 id={`${panelId}-title`} className={styles.panelTitle}>
          {formatMoney(payout.amountMinor, currency)}{' '}
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
            <dd>
              {formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}
            </dd>
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
  const detail = useApi(`payout:${payout.id}`, (signal) => earningsApi.payout(payout.id, signal));
  if (detail.status === 'loading') return <p role="status">Loading…</p>;
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
            cell: (s) => formatMoney(s.netTeacherMinor, s.currency),
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
            detail.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ConcernForm({ payoutId, onRaised }: { payoutId: string; onRaised: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Describe what looks wrong');
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await earningsApi.raiseConcern(payoutId, reason.trim());
      onRaised();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
        <Button type="submit" size="sm" loading={submitting} loadingText="Sending…">
          Send concern
        </Button>
      </div>
    </form>
  );
}
