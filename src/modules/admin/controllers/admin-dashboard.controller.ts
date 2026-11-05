import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UserIdParams, userIdParamsSchema } from '../../auth/schemas/user-admin.schema';
import {
  type AdminTeacherParams,
  adminTeacherParamsSchema,
} from '../../ledger/schemas/ledger.schema';
import type {
  OpenConcernsSummary,
  OpenPayoutDisputeRecord,
} from '../../payouts/services/payout.service';
import type { AdminFinancialSummary } from '../domain/dashboard.rules';
import {
  type FinancialSummaryQuery,
  financialSummaryQuerySchema,
} from '../schemas/admin-finance.schema';
import { AdminDashboard, AdminDashboardService } from '../services/admin-dashboard.service';
import {
  AdminFinanceService,
  type AdminTeacherStatementView,
} from '../services/admin-finance.service';
import {
  AdminUserOverview,
  AdminUserOverviewService,
} from '../services/admin-user-overview.service';

/** #102: queue counts for the admin navigation. */
@Roles([Role.ADMIN])
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  get(@CurrentUser() admin: AuthUser): Promise<AdminDashboard> {
    return this.dashboardService.getDashboard(admin);
  }
}

/** #103: one user's account, enrollments and courses taught, on one page. */
@Roles([Role.ADMIN])
@Controller('admin/users')
export class AdminUserOverviewController {
  constructor(private readonly overviewService: AdminUserOverviewService) {}

  @Get(':userId/overview')
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
  ): Promise<AdminUserOverview> {
    return this.overviewService.getOverview(admin, params.userId);
  }
}

/** #104, #105: admin financial summary by period and per-teacher account statement. */
@Roles([Role.ADMIN])
@Controller('admin')
export class AdminFinanceController {
  constructor(private readonly financeService: AdminFinanceService) {}

  @Get('finance/summary')
  getSummary(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(financialSummaryQuerySchema)) query: FinancialSummaryQuery,
  ): Promise<AdminFinancialSummary> {
    return this.financeService.getFinancialSummary(admin, query);
  }

  @Get('teachers/:teacherId/statement')
  getTeacherStatement(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(adminTeacherParamsSchema)) params: AdminTeacherParams,
  ): Promise<AdminTeacherStatementView> {
    return this.financeService.getTeacherStatement(admin, params.teacherId);
  }

  @Get('payout-concerns')
  listOpenConcerns(
    @CurrentUser() admin: AuthUser,
  ): Promise<OpenConcernsSummary<OpenPayoutDisputeRecord>> {
    return this.financeService.listOpenConcerns(admin);
  }
}
