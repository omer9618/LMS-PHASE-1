'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Loadable,
  PageHeader,
  Pager,
  Section,
  StatGrid,
  StatTile,
  Table,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { adminFinanceApi, type PayoutRunRow } from '@/lib/api/admin-finance';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@tanstack/react-query';

/** Teachers per page. The run is ranked, paged and totalled by the API in one request. */
const PAGE_SIZE = 25;

export type RunRow = PayoutRunRow;
export type RunStatus = RunRow['status'];

const STATUS: Record<RunStatus, { label: string; tone: BadgeTone; action: string }> = {
  DUE: { label: 'Due', tone: 'info', action: 'Record payout' },
  DISPUTED: { label: 'Concern raised', tone: 'danger', action: 'Open statement' },
  CLEAR: { label: 'Nothing owed', tone: 'neutral', action: 'Open statement' },
};

const COLUMNS: Array<Column<RunRow>> = [
  {
    key: 'teacher',
    header: 'Teacher',
    rowHeader: true,
    cell: (r) => <Link href={`/admin/teachers/${r.teacherId}`}>{r.name}</Link>,
  },
  {
    key: 'balance',
    header: 'Balance owed',
    numeric: true,
    cell: (r) =>
      r.balances.length === 0
        ? '—'
        : r.balances.map((b) => formatMoney(b.balanceMinor, b.currency)).join(' · '),
  },
  {
    key: 'last',
    header: 'Last payout',
    cell: (r) =>
      r.lastPayout ? `${formatDate(r.lastPayout.transferDate)} · ${r.lastPayout.status}` : 'Never',
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>,
  },
  {
    key: 'action',
    header: 'Action',
    cell: (r) => <Link href={`/admin/teachers/${r.teacherId}`}>{STATUS[r.status].action}</Link>,
  },
];

/**
 * The payout run (#85–#89): who is owed what, from each teacher's ledger, most owed first.
 * Paying is done at the bank first; "Record payout" on the teacher's statement then writes the
 * PAYOUT entry.
 */
export function PayoutRunScreen() {
  const [offset, setOffset] = useState(0);
  const run = useQuery({
    queryKey: ['payout-run', offset],
    queryFn: async ({ signal }) => {
      const [page, concerns] = await Promise.all([
        adminFinanceApi.getPayoutRun({ limit: PAGE_SIZE, offset }, signal),
        adminFinanceApi.listOpenConcerns(signal),
      ]);
      return { page, openConcerns: concerns.count };
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Balances from the ledger"
        title="Payout run"
        description="Send each transfer from the bank first, then record it on the teacher’s statement with the bank reference. Recording writes a PAYOUT entry; it never moves money."
      />
      <Loadable state={run} what="the payout run">
        {({ page, openConcerns }) => (
          <>
            <StatGrid label="Payout run summary">
              <StatTile label="Active teachers" value={page.total} />
              {page.totalsOwed.length === 0 ? (
                <StatTile label="Total owed" value="—" />
              ) : (
                page.totalsOwed.map((t) => (
                  <StatTile
                    key={t.currency}
                    label={`Total owed (${t.currency})`}
                    value={formatMoney(t.minor, t.currency)}
                  />
                ))
              )}
              <StatTile
                tone={openConcerns > 0 ? 'danger' : 'neutral'}
                label="Open concerns"
                value={openConcerns}
                action={{ href: '/admin/concerns', label: 'Look into them' }}
              />
            </StatGrid>
            <Section flush title="Teachers, most owed first">
              <Table
                caption="Teachers and what each is owed"
                hideCaption
                columns={COLUMNS}
                rows={page.items}
                rowKey={(r) => r.teacherId}
                empty="No active teachers yet."
              />
            </Section>
            <Pager total={page.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
          </>
        )}
      </Loadable>
    </>
  );
}
