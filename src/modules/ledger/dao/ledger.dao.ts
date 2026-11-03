import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { scopeWhere, TeacherOwnerScope, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

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

export type LedgerEntryRecord = Prisma.TeacherLedgerGetPayload<{
  select: typeof ledgerEntrySelect;
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
 * teacher_ledger (#80). Append-only: there is deliberately no update or delete method.
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
}
