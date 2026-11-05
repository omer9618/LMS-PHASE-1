import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import {
  DerivedCurrencyBalance,
  LedgerEntryRecord,
  LedgerService,
  TeacherSaleOrderItem,
} from '../../ledger/services/ledger.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { PayoutDao, PayoutRecord } from '../dao/payout.dao';
import {
  buildPayoutRecordingPlan,
  CoveredSaleItem,
  selectCoveredSalesForPayout,
} from '../domain/payout.rules';
import type { RecordPayoutInput } from '../schemas/payout.schema';

export type { CoveredSaleItem, PayoutRecord };

export interface RecordedPayoutResult {
  payout: PayoutRecord;
  ledgerEntry: LedgerEntryRecord;
  coveredSales: CoveredSaleItem[];
  remainingBalance: DerivedCurrencyBalance;
}

export interface PayoutDetailView {
  payout: PayoutRecord;
  coveredSales: CoveredSaleItem[];
}

/**
 * Payouts (#85-#89): admin payout recording with covered sales and negative ledger entry,
 * teacher payout view, dispute window & auto-accept job, raising and resolving concerns.
 */
@Injectable()
export class PayoutService {
  constructor(
    private readonly payoutDao: PayoutDao,
    private readonly ledgerService: LedgerService,
    private readonly userAdminService: UserAdminService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly auditService: AuditService,
    private readonly transactions: TransactionService,
  ) {}

  /**
   * #85 (FR-8.5): Admin records a payout to a teacher:
   * - Validates teacher role, positive amount <= teacher's available balance in the currency,
   *   transaction ID, transfer date, and optional period range [periodStart, periodEnd]
   * - Computes disputeDeadline from PAYOUT_DISPUTE_WINDOW_DAYS (default 7 days)
   * - Inside a single transaction:
   *   1. Creates the Payout row (status PENDING)
   *   2. Creates the negative PAYOUT compensating entry in teacher_ledger linked to payoutId
   *   3. Captures the covered confirmed sales for the period/currency
   *   4. Writes a PAYOUT_RECORDED audit entry.
   */
  async recordPayout(
    admin: AuthUser,
    teacherId: string,
    input: RecordPayoutInput,
  ): Promise<RecordedPayoutResult> {
    adminScope(admin);
    const now = new Date();
    const [targetUser, disputeWindowDays] = await Promise.all([
      this.userAdminService.getUser(admin, teacherId),
      this.platformSettings.get('PAYOUT_DISPUTE_WINDOW_DAYS'),
    ]);

    return this.transactions.run(async (tx) => {
      const currentBalance = await this.ledgerService.getCurrencyBalance(
        { teacherId: targetUser.id },
        input.currency,
        tx,
      );

      const plan = buildPayoutRecordingPlan({
        teacherId: targetUser.id,
        teacherRoles: targetUser.roles,
        amountMinor: input.amountMinor,
        currency: input.currency,
        availableBalanceMinor: currentBalance.balanceMinor,
        method: input.method,
        transactionId: input.transactionId,
        transferDate: input.transferDate,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        disputeWindowDays,
        now,
      });

      const createdPayout = await this.payoutDao.createPayout(
        { teacherId: targetUser.id },
        {
          amountMinor: plan.amountMinor,
          method: plan.method,
          transactionId: plan.transactionId,
          periodStart: plan.periodStart,
          periodEnd: plan.periodEnd,
          recordedById: admin.id,
          recordedAt: now,
          transferDate: plan.transferDate,
          disputeDeadline: plan.disputeDeadline,
        },
        tx,
      );

      const ledgerEntry = await this.ledgerService.recordPayoutEntry(
        {
          teacherId: targetUser.id,
          payoutId: createdPayout.id,
          amountMinor: plan.amountMinor,
          currency: plan.currency,
          description: plan.ledgerDescription,
          createdById: admin.id,
        },
        tx,
      );

      const separatedSales = await this.ledgerService.getSeparatedSales(
        { teacherId: targetUser.id },
        tx,
      );
      const coveredSales = selectCoveredSalesForPayout(
        separatedSales.confirmed.items.map(toCoveredSaleItem),
        plan.currency,
        plan.periodStart,
        plan.periodEnd,
      );

      const remainingBalance = await this.ledgerService.getCurrencyBalance(
        { teacherId: targetUser.id },
        plan.currency,
        tx,
      );

      await this.auditService.record(
        {
          actorUserId: admin.id,
          action: 'PAYOUT_RECORDED',
          entityType: 'payout',
          entityId: createdPayout.id,
          details: {
            teacherId: targetUser.id,
            amountMinor: plan.amountMinor.toString(),
            currency: plan.currency,
            method: plan.method,
            transactionId: plan.transactionId,
            transferDate: input.transferDate,
            periodStart: input.periodStart ?? null,
            periodEnd: input.periodEnd ?? null,
            disputeDeadline: plan.disputeDeadline.toISOString(),
            coveredSalesCount: coveredSales.length,
            coveredOrderItemIds: coveredSales.map((s) => s.orderItemId),
            ledgerEntryId: ledgerEntry.id,
          },
        },
        tx,
      );

      const payout = (await this.payoutDao.getPayoutBy(
        { teacherId: targetUser.id },
        { id: createdPayout.id },
        tx,
      ))!;

      return {
        payout,
        ledgerEntry,
        coveredSales,
        remainingBalance,
      };
    });
  }

  /** Teacher lists their own payouts, newest first. */
  listMyPayouts(teacher: AuthUser): Promise<PayoutRecord[]> {
    const scope = teacherScope(teacher);
    return this.payoutDao.getPayoutsBy(scope, {});
  }

  /** Teacher views a single payout with its itemised covered sales (#14 teacher-scoped 404). */
  async getMyPayout(teacher: AuthUser, payoutId: string): Promise<PayoutDetailView> {
    const scope = teacherScope(teacher);
    return this.getPayoutDetailForScope(scope, payoutId);
  }

  /** Admin lists payouts for a teacher. */
  async listTeacherPayoutsForAdmin(admin: AuthUser, teacherId: string): Promise<PayoutRecord[]> {
    adminScope(admin);
    const targetUser = await this.userAdminService.getUser(admin, teacherId);
    return this.payoutDao.getPayoutsBy({ teacherId: targetUser.id }, {});
  }

  /** Admin views a single payout with its itemised covered sales. */
  async getPayoutForAdmin(admin: AuthUser, payoutId: string): Promise<PayoutDetailView> {
    adminScope(admin);
    return this.getPayoutDetailForScope({ admin: true }, payoutId);
  }

  private async getPayoutDetailForScope(
    scope: TeacherScope,
    payoutId: string,
    tx?: TransactionClient,
  ): Promise<PayoutDetailView> {
    const payout = await this.payoutDao.getPayoutBy(scope, { id: payoutId }, tx);
    if (!payout) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'payout', id: payoutId });
    const currency = payout.ledgerEntries[0]?.currency ?? 'PKR';
    const separatedSales = await this.ledgerService.getSeparatedSales(
      { teacherId: payout.teacherId },
      tx,
    );
    const coveredSales = selectCoveredSalesForPayout(
      separatedSales.confirmed.items.map(toCoveredSaleItem),
      currency,
      payout.periodStart,
      payout.periodEnd,
    );
    return { payout, coveredSales };
  }
}

function toCoveredSaleItem(item: TeacherSaleOrderItem): CoveredSaleItem {
  return {
    orderItemId: item.id,
    orderId: item.orderId,
    paymentReference: item.paymentReference,
    courseId: item.courseId,
    courseTitle: item.courseTitle,
    priceMinor: item.priceMinor,
    commissionRateBps: item.commissionRateBps,
    commissionMinor: item.commissionMinor,
    netTeacherMinor: item.netTeacherMinor,
    currency: item.currency,
    verifiedAt: item.orderVerifiedAt,
  };
}