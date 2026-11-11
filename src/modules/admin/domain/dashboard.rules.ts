import { DomainError } from '../../../common/errors/domain.error';

/**
 * Admin dashboard and finance rules (#102, #104, #105, #106). Pure.
 */
export class AdminFinanceError extends DomainError {
  readonly code = 'BAD_REQUEST';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of "today" for the dashboard's daily counts: midnight UTC, the platform's time zone for
 * stored timestamps. A local business day (e.g. Pakistan, UTC+5) is an open question on #102.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The sum of the queues that need an admin, ignoring ones not available yet (null). */
export function totalAttention(counts: Array<number | null>): number {
  return counts.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

export interface FinancialPeriodBounds {
  from: Date | null;
  to: Date | null;
  fromDate: string | null;
  toDate: string | null;
}

/**
 * #104 (FR-12.3): Parses optional ISO date bounds `from` (`YYYY-MM-DD`) and `to` (`YYYY-MM-DD`)
 * into UTC inclusive timestamps (`00:00:00.000Z` to `23:59:59.999Z`), refusing `from > to`.
 */
export function parseFinancialPeriodBounds(input: {
  from?: string;
  to?: string;
}): FinancialPeriodBounds {
  const from = input.from ? new Date(`${input.from}T00:00:00.000Z`) : null;
  const to = input.to
    ? new Date(new Date(`${input.to}T00:00:00.000Z`).getTime() + DAY_MS - 1)
    : null;

  if (from && to && from.getTime() > to.getTime()) {
    throw new AdminFinanceError('Period start date "from" cannot be after end date "to"', {
      reason: 'INVALID_PERIOD_RANGE',
      from: input.from,
      to: input.to,
    });
  }

  return {
    from,
    to,
    fromDate: input.from ?? null,
    toDate: input.to ?? null,
  };
}

/**
 * Totals the database has already added up, one row per currency. The summary reads the whole
 * history, so adding it up in the application would mean loading every sale, refund, payout and
 * ledger entry on each view.
 */
export interface FinancialSalesTotals {
  currency: string;
  /** Confirmed order lines verified in the period. */
  count: number;
  grossMinor: bigint;
  commissionMinor: bigint;
  netTeacherMinor: bigint;
}

/** Refunds, or payouts, recorded in the period. */
export interface FinancialCountedTotals {
  currency: string;
  count: number;
  amountMinor: bigint;
}

export interface FinancialLedgerTotals {
  currency: string;
  /** Every entry up to the end of the period: what is owed to teachers at that point. */
  outstandingMinor: bigint;
  /** Entries inside the period. */
  periodNetMinor: bigint;
  /** REFUND entries inside the period (negative or zero). */
  refundDebitsMinor: bigint;
  /** ADJUSTMENT entries inside the period (signed). */
  adjustmentsMinor: bigint;
}

export interface CurrencyFinancialSummary {
  currency: string;
  /** Number of confirmed order line items in the period. */
  confirmedSalesCount: number;
  /** Gross confirmed sales in the period (`SUM(price_minor)`). */
  confirmedSalesGrossMinor: bigint;
  /** Platform commission retained on confirmed sales in the period (`SUM(commission_minor)`). */
  commissionRetainedMinor: bigint;
  /** Net teacher earnings on confirmed sales in the period (`SUM(net_teacher_minor)`). */
  teacherEarningsMinor: bigint;
  /** Number of refunds recorded in the period. */
  refundsCount: number;
  /** Total customer refund amount recorded in the period (`SUM(refunds.amount_minor)`). */
  refundsMinor: bigint;
  /** Teacher ledger refund debits in the period (negative or 0n). */
  teacherRefundDebitsMinor: bigint;
  /** Manual teacher ledger adjustments in the period (signed). */
  adjustmentsMinor: bigint;
  /** Number of teacher payouts recorded in the period. */
  payoutsCount: number;
  /** Total teacher payouts transferred in the period (positive amount paid out). */
  payoutsMinor: bigint;
  /** Net change in teacher liability during the period (`earnings + refundDebits + adjustments - payouts`). */
  periodNetLiabilityChangeMinor: bigint;
  /** Cumulative outstanding teacher liability as of the end of the period (`SUM(amount_minor)` in `teacher_ledger` up to `period.to`). */
  outstandingLiabilityMinor: bigint;
}

export interface AdminFinancialSummary {
  period: {
    from: string | null;
    to: string | null;
  };
  currencies: CurrencyFinancialSummary[];
}

/**
 * #104 (FR-12.3): Computes the admin financial summary by period, broken down per currency:
 * - confirmed sales (count, gross, commission retained, teacher net earnings)
 * - refunds (count, gross customer refunds, teacher refund debits)
 * - manual adjustments
 * - payouts (count, total paid out)
 * - period net liability change and cumulative outstanding teacher liability as of the end of the period.
 */
export function buildAdminFinancialSummary(input: {
  bounds: FinancialPeriodBounds;
  sales: readonly FinancialSalesTotals[];
  refunds: readonly FinancialCountedTotals[];
  payouts: readonly FinancialCountedTotals[];
  ledger: readonly FinancialLedgerTotals[];
}): AdminFinancialSummary {
  const map = new Map<string, CurrencyFinancialSummary>();

  const ensureCurrency = (currency: string): CurrencyFinancialSummary => {
    let row = map.get(currency);
    if (!row) {
      row = {
        currency,
        confirmedSalesCount: 0,
        confirmedSalesGrossMinor: 0n,
        commissionRetainedMinor: 0n,
        teacherEarningsMinor: 0n,
        refundsCount: 0,
        refundsMinor: 0n,
        teacherRefundDebitsMinor: 0n,
        adjustmentsMinor: 0n,
        payoutsCount: 0,
        payoutsMinor: 0n,
        periodNetLiabilityChangeMinor: 0n,
        outstandingLiabilityMinor: 0n,
      };
      map.set(currency, row);
    }
    return row;
  };

  for (const sale of input.sales) {
    const row = ensureCurrency(sale.currency);
    row.confirmedSalesCount += sale.count;
    row.confirmedSalesGrossMinor += sale.grossMinor;
    row.commissionRetainedMinor += sale.commissionMinor;
    row.teacherEarningsMinor += sale.netTeacherMinor;
  }
  for (const refund of input.refunds) {
    const row = ensureCurrency(refund.currency);
    row.refundsCount += refund.count;
    row.refundsMinor += refund.amountMinor;
  }
  for (const payout of input.payouts) {
    const row = ensureCurrency(payout.currency);
    row.payoutsCount += payout.count;
    row.payoutsMinor += payout.amountMinor;
  }
  for (const entry of input.ledger) {
    const row = ensureCurrency(entry.currency);
    row.outstandingLiabilityMinor += entry.outstandingMinor;
    row.periodNetLiabilityChangeMinor += entry.periodNetMinor;
    row.teacherRefundDebitsMinor += entry.refundDebitsMinor;
    row.adjustmentsMinor += entry.adjustmentsMinor;
  }

  return {
    period: {
      from: input.bounds.fromDate,
      to: input.bounds.toDate,
    },
    currencies: Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

export interface TeacherStatementLedgerItem {
  type: 'EARNING' | 'REFUND' | 'PAYOUT' | 'ADJUSTMENT';
}

export interface BuildTeacherAccountStatementInput<
  TTeacher,
  TBalance,
  TSeparatedSales,
  TPayout,
  TLedgerEntry extends TeacherStatementLedgerItem,
> {
  teacher: TTeacher;
  balances: TBalance[];
  sales: TSeparatedSales;
  payouts: TPayout[];
  ledgerEntries: TLedgerEntry[];
}

export interface TeacherAccountStatement<
  TTeacher,
  TBalance,
  TSeparatedSales,
  TPayout,
  TLedgerEntry extends TeacherStatementLedgerItem,
> {
  teacher: TTeacher;
  balances: TBalance[];
  sales: TSeparatedSales;
  refunds: {
    count: number;
    items: TLedgerEntry[];
  };
  adjustments: {
    count: number;
    items: TLedgerEntry[];
  };
  payouts: {
    count: number;
    items: TPayout[];
  };
  ledger: {
    count: number;
    items: TLedgerEntry[];
  };
}

/**
 * #105 (FR-12.4): Builds a complete per-teacher account statement combining sales, commission,
 * refunds, manual adjustments, payouts, full ledger entries, and derived balance per currency.
 */
export function buildTeacherAccountStatement<
  TTeacher,
  TBalance,
  TSeparatedSales,
  TPayout,
  TLedgerEntry extends TeacherStatementLedgerItem,
>(
  input: BuildTeacherAccountStatementInput<
    TTeacher,
    TBalance,
    TSeparatedSales,
    TPayout,
    TLedgerEntry
  >,
): TeacherAccountStatement<TTeacher, TBalance, TSeparatedSales, TPayout, TLedgerEntry> {
  const refunds = input.ledgerEntries.filter((entry) => entry.type === 'REFUND');
  const adjustments = input.ledgerEntries.filter((entry) => entry.type === 'ADJUSTMENT');

  return {
    teacher: input.teacher,
    balances: input.balances,
    sales: input.sales,
    refunds: {
      count: refunds.length,
      items: refunds,
    },
    adjustments: {
      count: adjustments.length,
      items: adjustments,
    },
    payouts: {
      count: input.payouts.length,
      items: input.payouts,
    },
    ledger: {
      count: input.ledgerEntries.length,
      items: input.ledgerEntries,
    },
  };
}
