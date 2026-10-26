import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

/**
 * Writes rows to audit_log for course decisions. Lives here until the audit log ticket (#107)
 * introduces a shared module; then this moves there and courses use its service instead.
 * audit_log is append-only: there are no update or delete methods, by design.
 */
@Injectable()
export class AuditLogDao {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditEntry(
    data: Prisma.AuditLogUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({ data, select: { id: true } });
  }
}
