import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const auditEntrySelect = {
  id: true,
  actorUserId: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { id: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditEntryRecord = Prisma.AuditLogGetPayload<{ select: typeof auditEntrySelect }>;

/** audit_log is append-only: there are no update or delete methods, by design. */
@Injectable()
export class AuditLogDao {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditEntry(
    data: Prisma.AuditLogUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({ data, select: { id: true } });
  }

  /** Newest first. */
  getAuditEntriesBy(
    where: Prisma.AuditLogWhereInput,
    page: { limit: number; offset: number },
  ): Promise<AuditEntryRecord[]> {
    return this.prisma.auditLog.findMany({
      where,
      select: auditEntrySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  /** The newest entry per entity_id among those matching `where`. */
  getLatestAuditEntryPerEntity(where: Prisma.AuditLogWhereInput): Promise<AuditEntryRecord[]> {
    return this.prisma.auditLog.findMany({
      where,
      select: auditEntrySelect,
      distinct: ['entityId'],
      orderBy: [{ entityId: 'asc' }, { createdAt: 'desc' }],
    });
  }

  countAuditEntriesBy(where: Prisma.AuditLogWhereInput): Promise<number> {
    return this.prisma.auditLog.count({ where });
  }
}
