import { Injectable } from '@nestjs/common';
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
import {
  OpenConcernsSummary,
  OpenPayoutDisputeRecord,
  PayoutRecord,
  PayoutService,
} from '../../payouts/services/payout.service';
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
    adminScope(admin);
    const bounds = parseFinancialPeriodBounds(query);

    // The database adds everything up: the summary covers all history and must not load it.
    const [sales, refunds, payouts, ledger] = await Promise.all([
      this.orderService.getVerifiedSalesTotals(bounds.from, bounds.to),
      this.ledgerService.getRefundTotals(admin, bounds.from, bounds.to),
      this.payoutService.getPayoutTotals(admin, bounds.from, bounds.to),
      this.ledgerService.getFinancialTotals(admin, bounds.from, bounds.to),
    ]);

    return buildAdminFinancialSummary({ bounds, sales, refunds, payouts, ledger });
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
