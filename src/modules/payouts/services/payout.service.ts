import { Injectable } from '@nestjs/common';
import { DisputeStatus, PayoutStatus } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import { EmailService } from '../../email/services/email.service';
import {
  DerivedCurrencyBalance,
  LedgerEntryRecord,
  LedgerService,
  TeacherSaleOrderItem,
} from '../../ledger/services/ledger.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { PayoutDao, PayoutDisputeRecord, PayoutRecord } from '../dao/payout.dao';
import {
  assertCanRaisePayoutConcern,
  assertCanResolvePayoutConcern,
  buildPayoutCoverageEmailLines,
  buildPayoutRecordingPlan,
  formatPayoutMoney,
  isPayoutDueToAutoAccept,
  CoveredSaleItem,
  selectCoveredSalesForPayout,
} from '../domain/payout.rules';
import type { RaisePayoutConcernInput, RecordPayoutInput, ResolvePayoutConcernInput } from '../schemas/payout.schema';

export type { CoveredSaleItem, PayoutDisputeRecord, PayoutRecord };

export interface RaisePayoutConcernResult {
  payout: PayoutRecord;
  dispute: PayoutDisputeRecord;
}

export interface ResolvePayoutConcernResult {
  payout: PayoutRecord;
  dispute: PayoutDisputeRecord;
  adjustmentEntry: LedgerEntryRecord | null;
}

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
    private readonly emailService: EmailService,
    @InjectPinoLogger(PayoutService.name) private readonly logger: PinoLogger,
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

    const result = await this.transactions.run(async (tx) => {
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
        currency: plan.currency,
      };
    });

    const period =
      input.periodStart && input.periodEnd
        ? `${input.periodStart} to ${input.periodEnd}`
        : null;
    const sent = await this.emailService.send(
      result.payout.teacher.email,
      'PAYOUT_RECORDED',
      {
        amount: formatPayoutMoney(result.payout.amountMinor, result.currency),
        transactionId: result.payout.transactionId ?? input.transactionId,
        transferDate: input.transferDate,
        period,
        disputeDeadline: result.payout.disputeDeadline.toISOString(),
        coveredLines: buildPayoutCoverageEmailLines(result.coveredSales),
        payoutUrl: this.emailService.appUrl(`/teacher/payouts/${result.payout.id}`),
      },
    );
    if (!sent) {
      this.logger.warn(
        { payoutId: result.payout.id, teacherId: result.payout.teacherId },
        'Payout notification email not delivered',
      );
    }

    return {
      payout: result.payout,
      ledgerEntry: result.ledgerEntry,
      coveredSales: result.coveredSales,
      remainingBalance: result.remainingBalance,
    };
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

  /**
   * #88 (FR-8.7): Teacher raises a concern on one of their own payouts within the 7-day
   * dispute window. Inside one transaction:
   * - Loads the teacher-scoped payout (404 if another teacher's or non-existent)
   * - Asserts the payout is PENDING and `now < disputeDeadline` (refuses with PAYOUT_REFUSED 409 otherwise)
   * - Transitions the payout status PENDING -> DISPUTED
   * - Creates an OPEN `payout_disputes` row
   * - Records a `PAYOUT_CONCERN_RAISED` audit entry.
   */
  async raiseMyPayoutConcern(
    teacher: AuthUser,
    payoutId: string,
    input: RaisePayoutConcernInput,
    now = new Date(),
  ): Promise<RaisePayoutConcernResult> {
    const scope = teacherScope(teacher);
    return this.transactions.run(async (tx) => {
      const current = await this.payoutDao.getPayoutBy(scope, { id: payoutId }, tx);
      if (!current) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'payout', id: payoutId });

      const reason = assertCanRaisePayoutConcern({
        payoutId: current.id,
        status: current.status,
        disputeDeadline: current.disputeDeadline,
        reason: input.reason,
        now,
      });

      const updated = await this.payoutDao.updatePayoutStatusIfCurrent(
        current.id,
        PayoutStatus.PENDING,
        { status: PayoutStatus.DISPUTED },
        tx,
      );
      if (!updated) {
        throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
          payoutId: current.id,
          reason: 'Payout status changed while raising concern',
        });
      }

      const dispute = await this.payoutDao.createPayoutDispute(
        { teacherId: current.teacherId },
        { payoutId: current.id, reason },
        tx,
      );

      await this.auditService.record(
        {
          actorUserId: teacher.id,
          action: 'PAYOUT_CONCERN_RAISED',
          entityType: 'payout_dispute',
          entityId: dispute.id,
          details: {
            payoutId: current.id,
            teacherId: current.teacherId,
            reason,
          },
        },
        tx,
      );

      const payout = (await this.payoutDao.getPayoutBy(scope, { id: current.id }, tx))!;
      return { payout, dispute };
    });
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

  /**
   * #89 (FR-8.8): Admin resolves an open payout concern on a DISPUTED payout (with no time limit).
   * Inside one transaction:
   * - Validates the payout is DISPUTED and has an OPEN dispute
   * - Optionally writes a manual ADJUSTMENT ledger entry via LedgerService.recordAdjustment
   * - Marks the dispute RESOLVED with resolutionNotes, resolvedById, resolvedAt, and adjustmentLedgerId
   * - Transitions the payout status DISPUTED -> RESOLVED
   * - Writes a PAYOUT_CONCERN_RESOLVED audit entry.
   */
  async resolvePayoutConcern(
    admin: AuthUser,
    payoutId: string,
    input: ResolvePayoutConcernInput,
    now = new Date(),
  ): Promise<ResolvePayoutConcernResult> {
    adminScope(admin);
    return this.transactions.run(async (tx) => {
      const current = await this.payoutDao.getPayoutBy({ admin: true }, { id: payoutId }, tx);
      if (!current) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'payout', id: payoutId });

      const openDispute = current.disputes.find((d) => d.status === DisputeStatus.OPEN) ?? null;
      const { disputeId, resolutionNotes } = assertCanResolvePayoutConcern({
        payoutId: current.id,
        payoutStatus: current.status,
        openDisputeId: openDispute?.id ?? null,
        resolutionNotes: input.resolutionNotes,
        adjustmentAmountMinor: input.adjustmentAmountMinor,
      });

      const updated = await this.payoutDao.updatePayoutStatusIfCurrent(
        current.id,
        PayoutStatus.DISPUTED,
        { status: PayoutStatus.RESOLVED },
        tx,
      );
      if (!updated) {
        throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
          payoutId: current.id,
          reason: 'Payout status changed while resolving concern',
        });
      }

      let adjustmentEntry: LedgerEntryRecord | null = null;
      if (input.adjustmentAmountMinor !== undefined) {
        const currency =
          input.adjustmentCurrency ?? current.ledgerEntries[0]?.currency ?? 'PKR';
        const adj = await this.ledgerService.recordAdjustment(
          admin,
          current.teacherId,
          {
            amountMinor: input.adjustmentAmountMinor,
            currency,
            reason: `Payout ${current.transactionId ?? current.id} dispute resolution: ${resolutionNotes}`,
          },
          tx,
        );
        adjustmentEntry = adj.entry;
      }

      const dispute = await this.payoutDao.resolvePayoutDispute(
        disputeId,
        {
          resolutionNotes,
          adjustmentLedgerId: adjustmentEntry?.id ?? null,
          resolvedById: admin.id,
          resolvedAt: now,
        },
        tx,
      );

      await this.auditService.record(
        {
          actorUserId: admin.id,
          action: 'PAYOUT_CONCERN_RESOLVED',
          entityType: 'payout_dispute',
          entityId: dispute.id,
          details: {
            payoutId: current.id,
            teacherId: current.teacherId,
            resolutionNotes,
            adjustmentLedgerId: adjustmentEntry?.id ?? null,
            adjustmentAmountMinor: input.adjustmentAmountMinor?.toString() ?? null,
          },
        },
        tx,
      );

      const payout = (await this.payoutDao.getPayoutBy({ admin: true }, { id: current.id }, tx))!;
      return { payout, dispute, adjustmentEntry };
    });
  }

  /** #102 / #106: Count of open payout concerns across the platform, for the admin dashboard. */
  countOpenConcerns(admin: AuthUser): Promise<number> {
    adminScope(admin);
    return this.payoutDao.countOpenDisputes();
  }

  /**
   * #87 (FR-8.7, FR-8.9): Hourly sweep that marks PENDING payouts past their disputeDeadline
   * as ACCEPTED, recording a PAYOUT_AUTO_ACCEPTED audit entry (actorUserId: null).
   * Disputed payouts are strictly skipped by both the query and the conditional update.
   */
  async autoAcceptDuePayouts(now = new Date()): Promise<number> {
    const ids = await this.payoutDao.getDuePendingPayoutIds(now);
    let accepted = 0;
    for (const id of ids) {
      try {
        const transitioned = await this.transactions.run(async (tx) => {
          const current = await this.payoutDao.getPayoutBy({ admin: true }, { id }, tx);
          if (!current || !isPayoutDueToAutoAccept(current, now)) return false;
          const updated = await this.payoutDao.updatePayoutStatusIfCurrent(
            current.id,
            PayoutStatus.PENDING,
            { status: PayoutStatus.ACCEPTED, acceptedAt: now },
            tx,
          );
          if (!updated) return false;
          await this.auditService.record(
            {
              actorUserId: null,
              action: 'PAYOUT_AUTO_ACCEPTED',
              entityType: 'payout',
              entityId: current.id,
              details: {
                teacherId: current.teacherId,
                amountMinor: current.amountMinor.toString(),
                disputeDeadline: current.disputeDeadline.toISOString(),
                acceptedAt: now.toISOString(),
              },
            },
            tx,
          );
          return true;
        });
        if (transitioned) accepted += 1;
      } catch (err) {
        this.logger.error({ err, payoutId: id }, 'Failed to auto-accept payout');
      }
    }
    return accepted;
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