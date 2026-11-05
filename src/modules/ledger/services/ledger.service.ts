import { Injectable } from '@nestjs/common';
import { LedgerEntryType, OrderStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import { EnrollmentService } from '../../enrollment/services/enrollment.service';
import { OrderService, TeacherOrderItemRecord } from '../../orders/services/order.service';
import { LedgerDao, LedgerEntryRecord, PayoutHistoryRecord } from '../dao/ledger.dao';
import { RefundDao, RefundRecord, RefundWithOrderRecord } from '../dao/refund.dao';
import {
  assertOrderRefundable,
  assertTargetIsTeacher,
  buildAdjustmentEntry,
  buildTeacherEarningsDashboard,
  buildEarningEntries,
  buildPayoutEntry,
  BuildPayoutEntryInput,
  buildRefundEntries,
  computeCurrencyBalance,
  computeDerivedBalances,
  CONFIRMED_SALE_ORDER_STATUSES,
  ConfirmedOrderLine,
  DerivedCurrencyBalance,
  PENDING_SALE_ORDER_STATUSES,
  SeparatedTeacherSales,
  separatePendingAndConfirmedSales,
  TeacherEarningsDashboard,
  TeacherSaleOrderItem,
} from '../domain/ledger.rules';
import type { RecordAdjustmentInput, RecordRefundInput } from '../schemas/ledger.schema';

export type {
  BuildPayoutEntryInput,
  ConfirmedOrderLine,
  DerivedCurrencyBalance,
  LedgerEntryRecord,
  PayoutHistoryRecord,
  RefundRecord,
  RefundWithOrderRecord,
  SeparatedTeacherSales,
  TeacherEarningsDashboard,
  TeacherSaleOrderItem,
};

export interface RecordEarningsInput {
  paymentReference: string;
  currency: string;
  lines: readonly ConfirmedOrderLine[];
  /** The admin who confirmed the payment. */
  createdById: string;
}

export interface RefundOrderResult {
  orderId: string;
  paymentReference: string;
  status: OrderStatus;
  refund: RefundRecord;
  enrollmentsRevoked: number;
  ledgerEntriesWritten: number;
  ledgerEntries: LedgerEntryRecord[];
}

export interface AdjustmentResult {
  entry: LedgerEntryRecord;
  balance: DerivedCurrencyBalance;
}

/**
 * The teacher ledger (#78-#83). Payment confirmation writes earnings here;
 * refunds, adjustments, and payouts write compensating entries. Entries are append-only
 * and the balance is their sum.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly ledgerDao: LedgerDao,
    private readonly refundDao: RefundDao,
    private readonly orderService: OrderService,
    private readonly enrollmentService: EnrollmentService,
    private readonly userAdminService: UserAdminService,
    private readonly auditService: AuditService,
    private readonly transactions: TransactionService,
  ) {}

  /**
   * #85 (FR-8.5): Records a negative PAYOUT compensating entry in teacher_ledger inside
   * the payout recording transaction.
   */
  async recordPayoutEntry(
    input: BuildPayoutEntryInput & { createdById: string },
    tx: TransactionClient,
  ): Promise<LedgerEntryRecord> {
    const draft = buildPayoutEntry(input);
    return this.ledgerDao.createLedgerEntry(
      { teacherId: draft.teacherId },
      {
        type: LedgerEntryType.PAYOUT,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        payoutId: draft.payoutId,
        description: draft.description,
        createdById: input.createdById,
      },
      tx,
    );
  }

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

  /**
   * #82 (FR-7.14): Admin records a refund on a VERIFIED order. Inside one transaction:
   * 1. Creates the Refund record (amount, transferDate, transactionId, reason, authorisedById)
   * 2. Transitions the order VERIFIED -> REFUNDED (writing ORDER_REFUNDED audit log)
   * 3. Revokes the student's active enrollments for the order's courses
   * 4. Writes negative REFUND compensating ledger entries for each teacher order line
   * 5. Records a REFUND_RECORDED audit entry.
   */
  async recordOrderRefund(
    admin: AuthUser,
    orderId: string,
    input: RecordRefundInput,
  ): Promise<RefundOrderResult> {
    adminScope(admin);
    const now = new Date();
    return this.transactions.run(async (tx) => {
      const order = await this.orderService.getOrderInTransaction(orderId, tx);
      assertOrderRefundable({
        orderId: order.id,
        orderStatus: order.status,
        orderTotalMinor: order.totalMinor,
        amountMinor: input.amountMinor,
        reason: input.reason,
        transactionId: input.transactionId,
        transferDate: input.transferDate,
      });

      const refund = await this.refundDao.createRefund(
        {
          orderId: order.id,
          amountMinor: input.amountMinor,
          reason: input.reason,
          transactionId: input.transactionId,
          transferDate: new Date(`${input.transferDate}T00:00:00.000Z`),
          authorisedById: admin.id,
        },
        tx,
      );

      const transition = await this.orderService.transition(
        order,
        'REFUND',
        admin.id,
        {
          refundId: refund.id,
          amountMinor: input.amountMinor.toString(),
          transactionId: input.transactionId,
          transferDate: input.transferDate,
          reason: input.reason,
        },
        now,
        tx,
      );

      const enrollmentsRevoked = await this.enrollmentService.revokePurchasedForOrder(
        admin,
        order.studentId,
        order.items.map((item) => item.courseId),
        `Order ${order.paymentReference} refunded: ${input.reason}`,
        tx,
      );

      const orderItemIds = order.items.map((item) => item.id);
      const existingRefundEntries = await this.ledgerDao.getLedgerEntriesBy(
        { admin: true },
        { type: LedgerEntryType.REFUND, orderItemId: { in: orderItemIds } },
        tx,
      );
      const refundDrafts = buildRefundEntries(
        order.items.map((item) => ({
          orderItemId: item.id,
          teacherId: item.teacherId,
          courseTitle: item.course.title,
          netTeacherMinor: item.netTeacherMinor,
        })),
        order.currency,
        order.paymentReference,
        refund.id,
        new Set(existingRefundEntries.map((entry) => entry.orderItemId!)),
      );

      const ledgerEntries: LedgerEntryRecord[] = [];
      for (const draft of refundDrafts) {
        const { teacherId, ...data } = draft;
        ledgerEntries.push(
          await this.ledgerDao.createLedgerEntry(
            { teacherId },
            { ...data, type: LedgerEntryType.REFUND, createdById: admin.id },
            tx,
          ),
        );
      }

      await this.auditService.record(
        {
          actorUserId: admin.id,
          action: 'REFUND_RECORDED',
          entityType: 'refund',
          entityId: refund.id,
          details: {
            orderId: order.id,
            paymentReference: order.paymentReference,
            amountMinor: input.amountMinor.toString(),
            currency: order.currency,
            transactionId: input.transactionId,
            transferDate: input.transferDate,
            reason: input.reason,
            enrollmentsRevoked,
            ledgerEntriesWritten: ledgerEntries.length,
          },
        },
        tx,
      );

      return {
        orderId: order.id,
        paymentReference: order.paymentReference,
        status: transition.to as OrderStatus,
        refund,
        enrollmentsRevoked,
        ledgerEntriesWritten: ledgerEntries.length,
        ledgerEntries,
      };
    });
  }

  /**
   * #83 (FR-8.10): Admin records a manual balance adjustment (signed credit or debit) on a
   * teacher's ledger, recording the amount, reason, and authorising user (`createdById`),
   * plus a `LEDGER_ADJUSTMENT_RECORDED` audit entry in the same transaction.
   */
  async recordAdjustment(
    admin: AuthUser,
    teacherId: string,
    input: RecordAdjustmentInput,
    tx?: TransactionClient,
  ): Promise<AdjustmentResult> {
    adminScope(admin);
    const targetUser = await this.userAdminService.getUser(admin, teacherId);
    assertTargetIsTeacher(targetUser.id, targetUser.roles);

    const draft = buildAdjustmentEntry({
      teacherId: targetUser.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reason: input.reason,
    });

    const run = async (t: TransactionClient): Promise<AdjustmentResult> => {
      const entry = await this.ledgerDao.createLedgerEntry(
        { teacherId: draft.teacherId },
        {
          type: LedgerEntryType.ADJUSTMENT,
          amountMinor: draft.amountMinor,
          currency: draft.currency,
          description: draft.description,
          createdById: admin.id,
        },
        t,
      );

      await this.auditService.record(
        {
          actorUserId: admin.id,
          action: 'LEDGER_ADJUSTMENT_RECORDED',
          entityType: 'teacher_ledger',
          entityId: entry.id,
          details: {
            teacherId: draft.teacherId,
            amountMinor: draft.amountMinor.toString(),
            currency: draft.currency,
            reason: draft.description,
          },
        },
        t,
      );

      const balance = await this.getCurrencyBalance({ teacherId: draft.teacherId }, draft.currency, t);
      return { entry, balance };
    };

    return tx ? run(tx) : this.transactions.run(run);
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

  /**
   * #84 (FR-8.4): Returns the signed-in teacher's earnings dashboard:
   * own sales (pending vs confirmed) with gross price, commission rate, commission amount,
   * net teacher earning, derived balances by currency, append-only ledger statement, and payout history.
   */
  async getMyEarningsDashboard(teacher: AuthUser): Promise<TeacherEarningsDashboard> {
    const scope = teacherScope(teacher);
    return this.getEarningsDashboardForScope(scope);
  }

  /**
   * #84: Returns the signed-in teacher's append-only ledger statement.
   */
  async listMyLedgerEntries(teacher: AuthUser): Promise<LedgerEntryRecord[]> {
    const scope = teacherScope(teacher);
    return this.ledgerDao.getLedgerEntriesBy(scope, {});
  }

  /**
   * #84: Admin views a specific teacher's earnings dashboard.
   */
  async getTeacherEarningsDashboardForAdmin(
    admin: AuthUser,
    teacherId: string,
  ): Promise<TeacherEarningsDashboard> {
    adminScope(admin);
    const targetUser = await this.userAdminService.getUser(admin, teacherId);
    assertTargetIsTeacher(targetUser.id, targetUser.roles);
    return this.getEarningsDashboardForScope({ teacherId: targetUser.id });
  }

  /**
   * #104: Admin lists refunds across the platform (optionally filtered by creation period).
   */
  listRefundsForAdmin(
    admin: AuthUser,
    period?: { from?: Date; to?: Date },
  ): Promise<RefundWithOrderRecord[]> {
    adminScope(admin);
    return this.refundDao.getRefundsBy({
      ...(period?.from || period?.to
        ? {
            createdAt: {
              ...(period.from ? { gte: period.from } : {}),
              ...(period.to ? { lte: period.to } : {}),
            },
          }
        : {}),
    });
  }

  private async getEarningsDashboardForScope(
    scope: TeacherScope,
    tx?: TransactionClient,
  ): Promise<TeacherEarningsDashboard> {
    const statuses: OrderStatus[] = [
      ...PENDING_SALE_ORDER_STATUSES,
      ...CONFIRMED_SALE_ORDER_STATUSES,
    ];
    const [orderItems, ledgerEntries, payouts] = await Promise.all([
      this.orderService.listTeacherOrderItems(scope, statuses, tx),
      this.ledgerDao.getLedgerEntriesBy(scope, {}, tx),
      this.ledgerDao.getPayoutsBy(scope, {}, tx),
    ]);
    return buildTeacherEarningsDashboard({
      orderItems: orderItems.map(toTeacherSaleOrderItem),
      ledgerEntries,
      payouts,
    });
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