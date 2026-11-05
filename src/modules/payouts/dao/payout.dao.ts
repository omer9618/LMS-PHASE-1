import { Injectable } from '@nestjs/common';
import { PayoutStatus, Prisma } from '@prisma/client';
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
}