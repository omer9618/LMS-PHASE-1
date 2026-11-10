'use client';

import Link from 'next/link';
import {
  Badge,
  Loadable,
  PageHeader,
  Section,
  StatGrid,
  StatTile,
  Table,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { adminApi } from '@/lib/api/admin';
import {
  adminFinanceApi,
  type CurrencyBalance,
  type TeacherStatement,
} from '@/lib/api/admin-finance';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useApi } from '@/lib/use-api';

/** Teachers shown in one run. Each needs a statement request, so the list is capped. */
const MAX_TEACHERS = 50;

export type RunStatus = 'DUE' | 'DISPUTED' | 'CLEAR';

export interface RunRow {
  teacherId: string;
  name: string;
  balances: CurrencyBalance[];
  lastPayout: { transferDate: string; status: string } | null;
  status: RunStatus;
}

/** The part of a balance that is owed to the teacher (positive, in minor units). */
function owed(balance: CurrencyBalance): bigint {
  const value = BigInt(balance.balanceMinor);
  return value > 0n ? value : 0n;
}

/** One row per teacher from their statement. Pure, so the rules are easy to test. */
export function toRunRow(statement: TeacherStatement): RunRow {
  const last = statement.payouts.items[0] ?? null;
  const hasOwed = statement.balances.some((b) => owed(b) > 0n);
  const disputed = statement.payouts.items.some((p) => p.status === 'DISPUTED');
  return {
    teacherId: statement.teacher.id,
    name: statement.teacher.fullName || statement.teacher.email,
    balances: statement.balances,
    lastPayout: last ? { transferDate: String(last.transferDate), status: last.status } : null,
    status: disputed ? 'DISPUTED' : hasOwed ? 'DUE' : 'CLEAR',
  };
}

/** Most owed first; teachers owed nothing last. Compares the largest owed amount per teacher. */
export function sortRun(rows: RunRow[]): RunRow[] {
  const top = (row: RunRow) => row.balances.reduce((max, b) => (owed(b) > max ? owed(b) : max), 0n);
  return [...rows].sort((a, b) => (top(b) > top(a) ? 1 : top(b) < top(a) ? -1 : 0));
}

/** Total owed per currency across the run, exact. */
export function totalsOwed(rows: RunRow[]): Array<{ currency: string; minor: string }> {
  const sums = new Map<string, bigint>();
  for (const row of rows) {
    for (const b of row.balances) sums.set(b.currency, (sums.get(b.currency) ?? 0n) + owed(b));
  }
  return [...sums]
    .filter(([, v]) => v > 0n)
    .map(([currency, v]) => ({ currency, minor: String(v) }));
}

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
 * The payout run (#85–#89): who is owed what, from each teacher's ledger. Paying is done at the
 * bank first; "Record payout" on the teacher's statement then writes the PAYOUT entry. The API
 * has no single "all balances" route, so this loads the teachers and their statements together.
 */
export function PayoutRunScreen() {
  const run = useApi('payout-run', async (signal) => {
    const teachers = await adminApi.listUsers(
      { role: 'TEACHER', status: 'ACTIVE', limit: MAX_TEACHERS },
      signal,
    );
    const [statements, concerns] = await Promise.all([
      Promise.all(teachers.items.map((t) => adminFinanceApi.getTeacherStatement(t.id, signal))),
      adminFinanceApi.listOpenConcerns(signal),
    ]);
    return {
      rows: sortRun(statements.map(toRunRow)),
      total: teachers.total,
      openConcerns: concerns.count,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Balances from the ledger"
        title="Payout run"
        description="Send each transfer from the bank first, then record it on the teacher’s statement with the bank reference. Recording writes a PAYOUT entry; it never moves money."
      />
      <Loadable state={run} what="the payout run">
        {({ rows, total, openConcerns }) => {
          const totals = totalsOwed(rows);
          const due = rows.filter((r) => r.status !== 'CLEAR').length;
          return (
            <>
              <StatGrid label="Payout run summary">
                <StatTile label="Teachers owed" value={due} />
                {totals.length === 0 ? (
                  <StatTile label="Total owed" value="—" />
                ) : (
                  totals.map((t) => (
                    <StatTile
                      key={t.currency}
                      tone="primary"
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
              <Section flush title="Teachers">
                <Table
                  caption="Teachers and what each is owed"
                  hideCaption
                  columns={COLUMNS}
                  rows={rows}
                  rowKey={(r) => r.teacherId}
                  empty="No active teachers yet."
                />
              </Section>
              {total > rows.length && (
                <p className="muted">
                  Showing the first {rows.length} of {total} teachers. Find others under Users and
                  teachers.
                </p>
              )}
            </>
          );
        }}
      </Loadable>
    </>
  );
}
