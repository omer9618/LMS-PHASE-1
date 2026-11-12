import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { scopeWhere, TeacherOwnerScope, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';
import type { LedgerBalanceGroup } from '../domain/ledger.rules';

const ledgerEntrySelect = {
  id: true,
  teacherId: true,
  type: true,
  amountMinor: true,
  currency: true,
  orderItemId: true,
  payoutId: true,
  refundId: true,
  description: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.TeacherLedgerSelect;

const payoutHistorySelect = {
  id: true,
  teacherId: true,
  amountMinor: true,
  method: true,
  transactionId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  recordedById: true,
  recordedAt: true,
  transferDate: true,
  disputeDeadline: true,
  acceptedAt: true,
} satisfies Prisma.PayoutSelect;

export type LedgerEntryRecord = Prisma.TeacherLedgerGetPayload<{
  select: typeof ledgerEntrySelect;
}>;

export type PayoutHistoryRecord = Prisma.PayoutGetPayload<{
  select: typeof payoutHistorySelect;
}>;

export interface CreateLedgerEntryData {
  type: LedgerEntryType;
  amountMinor: bigint;
  currency: string;
  orderItemId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  description?: string | null;
  createdById?: string | null;
}

/**
 * teacher_ledger (#78-#84). Append-only: there is deliberately no update or delete method.
 * Every read is teacher-scoped (#14); every write takes the owning teacher's scope.
 */
@Injectable()
export class LedgerDao {
  constructor(private readonly prisma: PrismaService) {}

  createLedgerEntry(
    owner: TeacherOwnerScope,
    data: CreateLedgerEntryData,
    tx?: TransactionClient,
  ): Promise<LedgerEntryRecord> {
    return (tx ?? this.prisma).teacherLedger.create({
      data: { ...data, teacherId: owner.teacherId },
      select: ledgerEntrySelect,
    });
  }

  getLedgerEntriesBy(
    scope: TeacherScope,
    where: Prisma.TeacherLedgerWhereInput,
    tx?: TransactionClient,
  ): Promise<LedgerEntryRecord[]> {
    return (tx ?? this.prisma).teacherLedger.findMany({
      where: { AND: [where, scopeWhere(scope)] },
      select: ledgerEntrySelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Sums per currency and entry type, counted by the database. */
  async getBalanceGroups(
    scope: TeacherScope,
    where: Prisma.TeacherLedgerWhereInput,
    tx?: TransactionClient,
  ): Promise<LedgerBalanceGroup[]> {
    const rows = await (tx ?? this.prisma).teacherLedger.groupBy({
      by: ['currency', 'type'],
      where: { AND: [where, scopeWhere(scope)] },
      _sum: { amountMinor: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      currency: row.currency,
      type: row.type,
      sumMinor: row._sum.amountMinor ?? 0n,
      count: row._count._all,
    }));
  }

  /** The same sums for several teachers at once, keyed by teacher id. */
  async getBalanceGroupsByTeacher(
    teacherIds: string[],
  ): Promise<Map<string, LedgerBalanceGroup[]>> {
    const result = new Map<string, LedgerBalanceGroup[]>();
    if (teacherIds.length === 0) return result;
    const rows = await this.prisma.teacherLedger.groupBy({
      by: ['teacherId', 'currency', 'type'],
      where: { teacherId: { in: teacherIds } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    });
    for (const row of rows) {
      const list = result.get(row.teacherId) ?? [];
      list.push({
        currency: row.currency,
        type: row.type,
        sumMinor: row._sum.amountMinor ?? 0n,
        count: row._count._all,
      });
      result.set(row.teacherId, list);
    }
    return result;
  }

  /** #84: teacher-scoped payout history, newest first. */
  getPayoutsBy(
    scope: TeacherScope,
    where: Prisma.PayoutWhereInput,
    tx?: TransactionClient,
  ): Promise<PayoutHistoryRecord[]> {
    return (tx ?? this.prisma).payout.findMany({
      where: { AND: [where, scopeWhere(scope)] },
      select: payoutHistorySelect,
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
    });
  }
  /**
   * The whole ledger added up per currency: what is owed up to the end of the period, and what
   * moved inside it, split into refund debits and adjustments. `null` leaves a side open.
   */
  async getFinancialTotals(
    from: Date | null,
    to: Date | null,
  ): Promise<
    Array<{
      currency: string;
      outstandingMinor: bigint;
      periodNetMinor: bigint;
      refundDebitsMinor: bigint;
      adjustmentsMinor: bigint;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        currency: string;
        outstanding: string;
        period_net: string;
        refund_debits: string;
        adjustments: string;
      }>
    >`
      SELECT l.currency::text AS currency,
             COALESCE(SUM(l.amount_minor) FILTER (
               WHERE ${to}::timestamptz IS NULL OR l.created_at <= ${to}::timestamptz), 0)::text AS outstanding,
             COALESCE(SUM(l.amount_minor) FILTER (
               WHERE (${from}::timestamptz IS NULL OR l.created_at >= ${from}::timestamptz)
                 AND (${to}::timestamptz IS NULL OR l.created_at <= ${to}::timestamptz)), 0)::text AS period_net,
             COALESCE(SUM(l.amount_minor) FILTER (
               WHERE l.type = 'REFUND'::"LedgerEntryType"
                 AND (${from}::timestamptz IS NULL OR l.created_at >= ${from}::timestamptz)
                 AND (${to}::timestamptz IS NULL OR l.created_at <= ${to}::timestamptz)), 0)::text AS refund_debits,
             COALESCE(SUM(l.amount_minor) FILTER (
               WHERE l.type = 'ADJUSTMENT'::"LedgerEntryType"
                 AND (${from}::timestamptz IS NULL OR l.created_at >= ${from}::timestamptz)
                 AND (${to}::timestamptz IS NULL OR l.created_at <= ${to}::timestamptz)), 0)::text AS adjustments
        FROM teacher_ledger l
       GROUP BY l.currency
      HAVING count(*) FILTER (WHERE ${to}::timestamptz IS NULL OR l.created_at <= ${to}::timestamptz) > 0`;
    return rows.map((row) => ({
      currency: row.currency,
      outstandingMinor: BigInt(row.outstanding),
      periodNetMinor: BigInt(row.period_net),
      refundDebitsMinor: BigInt(row.refund_debits),
      adjustmentsMinor: BigInt(row.adjustments),
    }));
  }
}
