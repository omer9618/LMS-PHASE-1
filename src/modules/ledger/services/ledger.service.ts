import { Injectable } from '@nestjs/common';
import { LedgerEntryType } from '@prisma/client';
import type { TeacherScope } from '../../../common/auth/scope';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { LedgerDao, LedgerEntryRecord } from '../dao/ledger.dao';
import {
  buildEarningEntries,
  computeCurrencyBalance,
  computeDerivedBalances,
  ConfirmedOrderLine,
  DerivedCurrencyBalance,
} from '../domain/ledger.rules';

export type { ConfirmedOrderLine, DerivedCurrencyBalance, LedgerEntryRecord };

export interface RecordEarningsInput {
  paymentReference: string;
  currency: string;
  lines: readonly ConfirmedOrderLine[];
  /** The admin who confirmed the payment. */
  createdById: string;
}

/**
 * The teacher ledger (#78, #79, #80). Payment confirmation writes earnings here; payouts and refunds (M3)
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

  /** Entries in the caller's scope, oldest first. */
  async listEntries(
    scope: TeacherScope,
    orderItemIds?: string[],
    tx?: TransactionClient,
  ): Promise<LedgerEntryRecord[]> {
    return this.ledgerDao.getLedgerEntriesBy(
      scope,
      orderItemIds ? { orderItemId: { in: orderItemIds } } : {},
      tx,
    );
  }

  /**
   * #79 (FR-8.2): Derives balances per currency by summing all ledger entries in the caller's scope.
   * No stored balance column exists anywhere in the schema.
   */
  async getDerivedBalances(
    scope: TeacherScope,
    tx?: TransactionClient,
  ): Promise<DerivedCurrencyBalance[]> {
    const entries = await this.ledgerDao.getLedgerEntriesBy(scope, {}, tx);
    return computeDerivedBalances(entries);
  }

  /**
   * #79 (FR-8.2): Derives the balance for a single currency in the caller's scope (0n when empty).
   */
  async getCurrencyBalance(
    scope: TeacherScope,
    currency: string,
    tx?: TransactionClient,
  ): Promise<DerivedCurrencyBalance> {
    const entries = await this.ledgerDao.getLedgerEntriesBy(scope, { currency }, tx);
    return computeCurrencyBalance(entries, currency);
  }
}