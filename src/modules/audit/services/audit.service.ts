import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RequestContext } from '../../../common/context/request-context';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { AuditEntryRecord, AuditLogDao } from '../dao/audit-log.dao';
import type { AuditLogQuery } from '../schemas/audit.schema';

export type { AuditEntryRecord };

export interface AuditEntry {
  /** Null for system actions (scheduled jobs). */
  actorUserId: string | null;
  /** SCREAMING_SNAKE verb phrase, e.g. COURSE_APPROVED, ORDER_LAPSED. */
  action: string;
  entityType: string;
  entityId?: string;
  /** Reasons, from/to states, amounts (money as strings). Never secrets. */
  details?: Prisma.InputJsonObject;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The audit log (#107): who did what to which record, when, from where, and why.
 * Write entries inside the same transaction as the change they describe.
 */
@Injectable()
export class AuditService {
  constructor(private readonly auditLogDao: AuditLogDao) {}

  record(entry: AuditEntry, tx?: TransactionClient): Promise<void> {
    return this.auditLogDao.createAuditEntry(
      {
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
        ipAddress: RequestContext.get().ipAddress ?? null,
      },
      tx,
    );
  }

  /**
   * The newest `action` entry for each of the given entities.
   * Callers must already be authorised for every id they pass.
   */
  async latestFor(
    entityType: string,
    action: string,
    entityIds: string[],
  ): Promise<Map<string, AuditEntryRecord>> {
    if (entityIds.length === 0) return new Map();
    const entries = await this.auditLogDao.getLatestAuditEntryPerEntity({
      entityType,
      action,
      entityId: { in: entityIds },
    });
    return new Map(entries.map((entry) => [entry.entityId as string, entry]));
  }

  /** #108: admin search by actor, action, entity and date range. */
  async search(query: AuditLogQuery): Promise<Paged<AuditEntryRecord>> {
    const where: Prisma.AuditLogWhereInput = {
      actorUserId: query.actorUserId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      createdAt: query.from || query.to ? { gte: query.from, lt: query.to } : undefined,
      actor: query.actorEmail
        ? { email: { contains: query.actorEmail, mode: 'insensitive' } }
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.auditLogDao.getAuditEntriesBy(where, query),
      this.auditLogDao.countAuditEntriesBy(where),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }
}
