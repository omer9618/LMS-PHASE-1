import { Injectable } from '@nestjs/common';
import { LedgerEntryType, OrderStatus } from '@prisma/client';
import type { TeacherScope } from '../../../common/auth/scope';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { OrderService, TeacherOrderItemRecord } from '../../orders/services/order.service';
import { LedgerDao, LedgerEntryRecord } from '../dao/ledger.dao';
import {
  buildEarningEntries,
  computeCurrencyBalance,
  computeDerivedBalances,
  CONFIRMED_SALE_ORDER_STATUSES,
  ConfirmedOrderLine,
  DerivedCurrencyBalance,
  PENDING_SALE_ORDER_STATUSES,
   SeparatedTeacherSales,
  separatePendingAndConfirmedSales,
  TeacherSaleOrderItem,
} from '../domain/ledger.rules';

export type {
  ConfirmedOrderLine,
  DerivedCurrencyBalance,
  LedgerEntryRecord,
  SeparatedTeacherSales,
  TeacherSaleOrderItem,
};

export interface RecordEarningsInput {
  paymentReference: string;
  currency: string;
  lines: readonly ConfirmedOrderLine[];
  /** The admin who confirmed the payment. */
  createdById: string;
}

/**
 * The teacher ledger (#78, #79, #80, #81). Payment confirmation writes earnings here; payouts and refunds (M3)
 * extend this service. Entries are append-only and the balance is their sum.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly ledgerDao: LedgerDao,
    private readonly orderService: OrderService,
  ) {}

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

  /**
   * #81 (FR-8.3): Returns a teacher's pending (unverified: PENDING, PROOF_SUBMITTED) sales
   * separately from confirmed (VERIFIED) sales and their earned ledger balance.
   */
  async getSeparatedSales(
    scope: TeacherScope,
    tx?: TransactionClient,
  ): Promise<SeparatedTeacherSales> {
    const statuses: OrderStatus[] = [
      ...PENDING_SALE_ORDER_STATUSES,
      ...CONFIRMED_SALE_ORDER_STATUSES,
    ];
    const [orderItems, ledgerEntries] = await Promise.all([
      this.orderService.listTeacherOrderItems(scope, statuses, tx),
      this.ledgerDao.getLedgerEntriesBy(scope, {}, tx),
    ]);
    return separatePendingAndConfirmedSales(
      orderItems.map(toTeacherSaleOrderItem),
      ledgerEntries,
    );
  }
}

function toTeacherSaleOrderItem(record: TeacherOrderItemRecord): TeacherSaleOrderItem {
  return {
    id: record.id,
    orderId: record.orderId,
    paymentReference: record.order.paymentReference,
    orderStatus: record.order.status,
    currency: record.order.currency,
    courseId: record.courseId,
    courseTitle: record.course.title,
    teacherId: record.teacherId,
    priceMinor: record.priceMinor,
    commissionRateBps: record.commissionRateBps,
    commissionMinor: record.commissionMinor,
    netTeacherMinor: record.netTeacherMinor,
    orderCreatedAt: record.order.createdAt,
    orderVerifiedAt: record.order.verifiedAt,
  };
}