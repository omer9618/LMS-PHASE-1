import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AdminUserView, UserAdminService } from '../../auth/services/user-admin.service';
import { assertTargetIsTeacher } from '../../ledger/domain/ledger.rules';
import {
  DerivedCurrencyBalance,
  LedgerEntryRecord,
  LedgerService,
  SeparatedTeacherSales,
} from '../../ledger/services/ledger.service';
import { OrderService } from '../../orders/services/order.service';
import { OpenConcernsSummary, OpenPayoutDisputeRecord, PayoutRecord, PayoutService } from '../../payouts/services/payout.service';
import {
  type AdminFinancialSummary,
  buildAdminFinancialSummary,
  buildTeacherAccountStatement,
  parseFinancialPeriodBounds,
  type TeacherAccountStatement,
} from '../domain/dashboard.rules';
import type { FinancialSummaryQuery } from '../schemas/admin-finance.schema';

export type AdminTeacherStatementView = TeacherAccountStatement<
  AdminUserView,
  DerivedCurrencyBalance,
  SeparatedTeacherSales,
  PayoutRecord,
  LedgerEntryRecord
>;

/**
 * #104, #105 (FR-12.3, FR-12.4): Cross-module admin finance service.
 * Owns no tables — aggregates confirmed sales, refunds, payouts, and ledger entries through each
 * owning module's exported service.
 */
@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly userAdminService: UserAdminService,
    private readonly orderService: OrderService,
    private readonly ledgerService: LedgerService,
    private readonly payoutService: PayoutService,
  ) {}

  /**
   * #104 (FR-12.3): Admin financial summary by period (sales, commission, refunds, payouts,
   * outstanding liability).
   */
  async getFinancialSummary(
    admin: AuthUser,
    query: FinancialSummaryQuery,
  ): Promise<AdminFinancialSummary> {
    const scope = adminScope(admin);
    const bounds = parseFinancialPeriodBounds(query);

    const [verifiedOrderItems, refunds, payouts, ledgerEntries] = await Promise.all([
      this.orderService.listTeacherOrderItems(scope, [OrderStatus.VERIFIED]),
      this.ledgerService.listRefundsForAdmin(admin),
      this.payoutService.listPayoutsForAdmin(admin),
      this.ledgerService.listEntries(scope),
    ]);

    return buildAdminFinancialSummary({
      bounds,
      confirmedSales: verifiedOrderItems.map((item) => ({
        currency: item.order.currency,
        priceMinor: item.priceMinor,
        commissionMinor: item.commissionMinor,
        netTeacherMinor: item.netTeacherMinor,
        verifiedAt: item.order.verifiedAt,
      })),
      refunds: refunds.map((refund) => ({
        currency: refund.order.currency,
        amountMinor: refund.amountMinor,
        createdAt: refund.createdAt,
      })),
      payouts: payouts.map((payout) => ({
        currency: payout.ledgerEntries[0]?.currency ?? 'PKR',
        amountMinor: payout.amountMinor,
        recordedAt: payout.recordedAt,
      })),
      ledgerEntries: ledgerEntries.map((entry) => ({
        currency: entry.currency,
        type: entry.type,
        amountMinor: entry.amountMinor,
        createdAt: entry.createdAt,
      })),
    });
  }

  /**
   * #105 (FR-12.4): Per-teacher account statement view — sales, commission, refunds, adjustments,
   * payouts, and current balance for any teacher.
   */
  async getTeacherStatement(
    admin: AuthUser,
    teacherId: string,
  ): Promise<AdminTeacherStatementView> {
    adminScope(admin);
    const teacher = await this.userAdminService.getUser(admin, teacherId);
    assertTargetIsTeacher(teacherId, teacher.roles);

    const scope = { teacherId };
    const [balances, sales, payouts, ledgerEntries] = await Promise.all([
      this.ledgerService.getDerivedBalances(scope),
      this.ledgerService.getSeparatedSales(scope),
      this.payoutService.listTeacherPayoutsForAdmin(admin, teacherId),
      this.ledgerService.listEntries(scope),
    ]);

    return buildTeacherAccountStatement({
      teacher,
      balances,
      sales,
      payouts,
      ledgerEntries,
    });
  }

  /**
   * #106 (FR-12.5): Open payout concerns listed with age so none is left unresolved.
   */
  listOpenConcerns(
    admin: AuthUser,
    now = new Date(),
  ): Promise<OpenConcernsSummary<OpenPayoutDisputeRecord>> {
    adminScope(admin);
    return this.payoutService.listOpenConcernsForAdmin(admin, now);
  }
}