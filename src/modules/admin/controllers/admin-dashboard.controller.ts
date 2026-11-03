import { Controller, Get, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UserIdParams, userIdParamsSchema } from '../../auth/schemas/user-admin.schema';
import { AdminDashboard, AdminDashboardService } from '../services/admin-dashboard.service';
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
