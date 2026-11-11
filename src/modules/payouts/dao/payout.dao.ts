import { Injectable } from '@nestjs/common';
import { DisputeStatus, PayoutStatus, Prisma } from '@prisma/client';
import { scopeWhere, TeacherOwnerScope, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const payoutDisputeSelect = {
  id: true,
  payoutId: true,
  teacherId: true,
  reason: true,
  status: true,
  resolutionNotes: true,
  adjustmentLedgerId: true,
  createdAt: true,
  resolvedById: true,
  resolvedAt: true,
  resolvedBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.PayoutDisputeSelect;

const payoutSelect = {
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
  teacher: { select: { id: true, email: true, fullName: true } },
  recordedBy: { select: { id: true, email: true, fullName: true } },
  ledgerEntries: {
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  disputes: {
    select: payoutDisputeSelect,
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PayoutSelect;

export type PayoutRecord = Prisma.PayoutGetPayload<{ select: typeof payoutSelect }>;
export type PayoutDisputeRecord = Prisma.PayoutDisputeGetPayload<{
  select: typeof payoutDisputeSelect;
}>;

const openPayoutDisputeSelect = {
  id: true,
  payoutId: true,
  teacherId: true,
  reason: true,
  status: true,
  createdAt: true,
  teacher: { select: { id: true, email: true, fullName: true } },
  payout: {
    select: {
      id: true,
      amountMinor: true,
      method: true,
      transactionId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      recordedAt: true,
      transferDate: true,
      disputeDeadline: true,
      ledgerEntries: {
        select: { currency: true },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
      },
    },
  },
} satisfies Prisma.PayoutDisputeSelect;

export type OpenPayoutDisputeRecord = Prisma.PayoutDisputeGetPayload<{
  select: typeof openPayoutDisputeSelect;
}>;

export interface CreatePayoutData {
  amountMinor: bigint;
  method: string;
  transactionId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  recordedById: string;
  recordedAt: Date;
  transferDate: Date;
  disputeDeadline: Date;
  status?: PayoutStatus;
}

/**
 * payouts & payout_disputes (#85-#89). Every read is teacher-scoped (#14);
 * every write takes the owning teacher's scope or runs in an admin/job transaction.
 */
/** One active teacher in the payout run. */
export interface PayoutRunTeacherRow {
  id: string;
  fullName: string | null;
  email: string;
}

export interface PayoutRunFacts {
  /** Each teacher's most recent payout. */
  lastPayout: Map<string, { transferDate: Date | null; status: PayoutStatus }>;
  /** Teachers with a payout in dispute. */
  disputed: Set<string>;
}

@Injectable()
export class PayoutDao {
  constructor(private readonly prisma: PrismaService) {}

  createPayout(
    owner: TeacherOwnerScope,
    data: CreatePayoutData,
    tx?: TransactionClient,
  ): Promise<PayoutRecord> {
    return (tx ?? this.prisma).payout.create({
      data: {
        ...data,
        teacherId: owner.teacherId,
        status: data.status ?? PayoutStatus.PENDING,
      },
      select: payoutSelect,
    });
  }

  getPayoutBy(
    scope: TeacherScope,
    where: Prisma.PayoutWhereInput,
    tx?: TransactionClient,
  ): Promise<PayoutRecord | null> {
    return (tx ?? this.prisma).payout.findFirst({
      where: { AND: [where, scopeWhere(scope)] },
      select: payoutSelect,
    });
  }

  getPayoutsBy(
    scope: TeacherScope,
    where: Prisma.PayoutWhereInput,
    tx?: TransactionClient,
  ): Promise<PayoutRecord[]> {
    return (tx ?? this.prisma).payout.findMany({
      where: { AND: [where, scopeWhere(scope)] },
      select: payoutSelect,
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
    });
  }

  /**
   * #87: IDs of PENDING payouts whose disputeDeadline <= now, oldest first, so the
   * auto-accept job can process each payout in its own transaction.
   */
  async getDuePendingPayoutIds(now: Date): Promise<string[]> {
    const rows = await this.prisma.payout.findMany({
      where: {
        status: PayoutStatus.PENDING,
        disputeDeadline: { lte: now },
      },
      select: { id: true },
      orderBy: { disputeDeadline: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  /**
   * #87 / #88 / #89: Conditionally updates a payout's status only if it is currently in
   * `expectedStatus`, returning true when the row transitioned.
   */
  async updatePayoutStatusIfCurrent(
    payoutId: string,
    expectedStatus: PayoutStatus,
    data: { status: PayoutStatus; acceptedAt?: Date | null },
    tx?: TransactionClient,
  ): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).payout.updateMany({
      where: { id: payoutId, status: expectedStatus },
      data,
    });
    return count === 1;
  }

  /** #88: Creates an OPEN payout_disputes row for the owning teacher. */
  createPayoutDispute(
    owner: TeacherOwnerScope,
    data: { payoutId: string; reason: string },
    tx?: TransactionClient,
  ): Promise<PayoutDisputeRecord> {
    return (tx ?? this.prisma).payoutDispute.create({
      data: {
        payoutId: data.payoutId,
        teacherId: owner.teacherId,
        reason: data.reason,
      },
      select: payoutDisputeSelect,
    });
  }

  /** #89: Resolves an OPEN payout_disputes row with resolutionNotes, resolvedById, resolvedAt, and optional adjustmentLedgerId. */
  resolvePayoutDispute(
    disputeId: string,
    data: {
      resolutionNotes: string;
      adjustmentLedgerId: string | null;
      resolvedById: string;
      resolvedAt: Date;
    },
    tx?: TransactionClient,
  ): Promise<PayoutDisputeRecord> {
    return (tx ?? this.prisma).payoutDispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.RESOLVED,
        resolutionNotes: data.resolutionNotes,
        adjustmentLedgerId: data.adjustmentLedgerId,
        resolvedById: data.resolvedById,
        resolvedAt: data.resolvedAt,
      },
      select: payoutDisputeSelect,
    });
  }

  /** #102 / #106: Counts open payout concerns across the platform. */
  countOpenDisputes(tx?: TransactionClient): Promise<number> {
    return (tx ?? this.prisma).payoutDispute.count({
      where: { status: DisputeStatus.OPEN },
    });
  }

  /** #106 (FR-12.5): Lists open payout concerns ordered oldest first. */
  getOpenDisputes(scope: TeacherScope, tx?: TransactionClient): Promise<OpenPayoutDisputeRecord[]> {
    return (tx ?? this.prisma).payoutDispute.findMany({
      where: { AND: [{ status: DisputeStatus.OPEN }, scopeWhere(scope)] },
      select: openPayoutDisputeSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  // ── The payout run: one read model over the ledger, users and payouts ──

  /**
   * Active teachers, most owed first (largest positive balance in any currency, then name), one
   * page. Ranked in the database so the run never has to load every teacher's history.
   */
  getPayoutRunPage(limit: number, offset: number): Promise<PayoutRunTeacherRow[]> {
    return this.prisma.$queryRaw<PayoutRunTeacherRow[]>`
      WITH owed AS (
        SELECT teacher_id, currency, SUM(amount_minor) AS balance
          FROM teacher_ledger
         GROUP BY teacher_id, currency
      ), ranked AS (
        SELECT teacher_id, MAX(balance) FILTER (WHERE balance > 0) AS top_owed
          FROM owed
         GROUP BY teacher_id
      )
      SELECT u.id, u.full_name AS "fullName", u.email::text AS email
        FROM users u
        JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER'::"Role"
        LEFT JOIN ranked ON ranked.teacher_id = u.id
       WHERE u.status = 'ACTIVE'::"UserStatus"
       ORDER BY COALESCE(ranked.top_owed, 0) DESC, u.full_name ASC NULLS LAST, u.id ASC
       LIMIT ${limit} OFFSET ${offset}`;
  }

  countPayoutRunTeachers(): Promise<number> {
    return this.prisma.user.count({
      where: { status: 'ACTIVE', roles: { some: { role: 'TEACHER' } } },
    });
  }

  /** What is owed across all active teachers, per currency: only positive balances count. */
  async getPayoutRunTotals(): Promise<Array<{ currency: string; minor: bigint }>> {
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; minor: string }>>`
      WITH owed AS (
        SELECT teacher_id, currency, SUM(amount_minor) AS balance
          FROM teacher_ledger
         GROUP BY teacher_id, currency
      )
      SELECT owed.currency, SUM(owed.balance)::text AS minor
        FROM owed
        JOIN users u ON u.id = owed.teacher_id AND u.status = 'ACTIVE'::"UserStatus"
        JOIN user_roles r ON r.user_id = u.id AND r.role = 'TEACHER'::"Role"
       WHERE owed.balance > 0
       GROUP BY owed.currency
       ORDER BY owed.currency`;
    return rows.map((row) => ({ currency: row.currency, minor: BigInt(row.minor) }));
  }

  /** The latest payout and any payout in dispute, for the teachers on one page of the run. */
  async getPayoutRunFacts(teacherIds: string[]): Promise<PayoutRunFacts> {
    const facts: PayoutRunFacts = { lastPayout: new Map(), disputed: new Set() };
    if (teacherIds.length === 0) return facts;
    const ids = Prisma.join(teacherIds);
    const [latest, disputed] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ teacher_id: string; transfer_date: Date | null; status: PayoutStatus }>
      >`
        SELECT DISTINCT ON (teacher_id) teacher_id, transfer_date, status
          FROM payouts
         WHERE teacher_id IN (${ids})
         ORDER BY teacher_id, recorded_at DESC, id ASC`,
      this.prisma.$queryRaw<Array<{ teacher_id: string }>>`
        SELECT DISTINCT teacher_id
          FROM payouts
         WHERE teacher_id IN (${ids}) AND status = 'DISPUTED'::"PayoutStatus"`,
    ]);
    for (const row of latest) {
      facts.lastPayout.set(row.teacher_id, { transferDate: row.transfer_date, status: row.status });
    }
    for (const row of disputed) facts.disputed.add(row.teacher_id);
    return facts;
  }
  /**
   * Payouts recorded inside the period, per currency. A payout has no currency of its own: it is
   * the currency of its ledger entry, or PKR when it has none.
   */
  async getTotalsByCurrency(
    from: Date | null,
    to: Date | null,
  ): Promise<Array<{ currency: string; count: number; amountMinor: bigint }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ currency: string; count: number; amount: string }>
    >`
      SELECT COALESCE(l.currency, 'PKR')::text AS currency,
             count(*)::int AS count,
             SUM(p.amount_minor)::text AS amount
        FROM payouts p
        LEFT JOIN LATERAL (
          SELECT currency FROM teacher_ledger WHERE payout_id = p.id ORDER BY created_at ASC, id ASC LIMIT 1
        ) l ON true
       WHERE (${from}::timestamptz IS NULL OR p.recorded_at >= ${from}::timestamptz)
         AND (${to}::timestamptz IS NULL OR p.recorded_at <= ${to}::timestamptz)
       GROUP BY COALESCE(l.currency, 'PKR')`;
    return rows.map((row) => ({
      currency: row.currency,
      count: row.count,
      amountMinor: BigInt(row.amount),
    }));
  }
}
