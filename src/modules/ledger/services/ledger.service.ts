import { Injectable } from '@nestjs/common';
import { LedgerEntryType } from '@prisma/client';
import type { TeacherScope } from '../../../common/auth/scope';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { LedgerDao, LedgerEntryRecord } from '../dao/ledger.dao';
import { buildEarningEntries, ConfirmedOrderLine } from '../domain/ledger.rules';

export type { ConfirmedOrderLine, LedgerEntryRecord };

export interface RecordEarningsInput {
  paymentReference: string;
  currency: string;
  lines: readonly ConfirmedOrderLine[];
  /** The admin who confirmed the payment. */
  createdById: string;
}

/**
 * The teacher ledger (#80). Payment confirmation writes earnings here; payouts and refunds (M3)
 * extend this service. Entries are append-only and the balance is their sum.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly ledgerDao: LedgerDao) {}

  /**
   * #80: one EARNING entry per confirmed order line for its net teacher amount, inside the
   * confirmation's transaction. Refuses (LEDGER_REFUSED) a line that already has an earning.
   */
  async recordEarnings(
    input: RecordEarningsInput,
    tx: TransactionClient,
  ): Promise<LedgerEntryRecord[]> {
    const orderItemIds = input.lines.map((line) => line.orderItemId);
    const existing = await this.ledgerDao.getLedgerEntriesBy(
      { admin: true },
      { type: LedgerEntryType.EARNING, orderItemId: { in: orderItemIds } },
      tx,
    );
    const drafts = buildEarningEntries(
      input.lines,
      input.currency,
      input.paymentReference,
      new Set(existing.map((entry) => entry.orderItemId!)),
    );
    const created: LedgerEntryRecord[] = [];
    for (const draft of drafts) {
      const { teacherId, ...data } = draft;
      created.push(
        await this.ledgerDao.createLedgerEntry(
          { teacherId },
          { ...data, type: LedgerEntryType.EARNING, createdById: input.createdById },
          tx,
        ),
      );
    }
    return created;
  }

  /** Entries in the caller's scope, oldest first. For wave 2 (balances, statements). */
  async listEntries(scope: TeacherScope, orderItemIds?: string[]): Promise<LedgerEntryRecord[]> {
    return this.ledgerDao.getLedgerEntriesBy(
      scope,
      orderItemIds ? { orderItemId: { in: orderItemIds } } : {},
    );
  }
}
