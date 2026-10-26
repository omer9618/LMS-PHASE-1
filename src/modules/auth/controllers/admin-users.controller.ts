import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { Paged } from '../../audit/services/audit.service';
import {
  CreateAccountInput,
  createAccountSchema,
  GrantRoleInput,
  grantRoleSchema,
  ListUsersQuery,
  listUsersQuerySchema,
  ReasonInput,
  reasonSchema,
  UserIdParams,
  userIdParamsSchema,
  UserRoleParams,
  userRoleParamsSchema,
} from '../schemas/user-admin.schema';
import { AdminUserView, UserAdminService } from '../services/user-admin.service';

/** #15: admin account creation and account status management. */
@Roles([Role.ADMIN])
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Get()
  list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Paged<AdminUserView>> {
    return this.userAdminService.listUsers(admin, query);
  }

  @Get(':userId')
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
  ): Promise<AdminUserView> {
    return this.userAdminService.getUser(admin, params.userId);
  }

  @Post()
  create(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountInput,
  ): Promise<AdminUserView> {
    return this.userAdminService.createAccount(admin, body);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ): Promise<AdminUserView> {
    return this.userAdminService.changeStatus(admin, params.userId, 'SUSPEND', body.reason);
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ): Promise<AdminUserView> {
    return this.userAdminService.changeStatus(admin, params.userId, 'REACTIVATE', body.reason);
  }

  @Post(':userId/roles')
  @HttpCode(200)
  grantRole(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
    @Body(new ZodValidationPipe(grantRoleSchema)) body: GrantRoleInput,
  ): Promise<AdminUserView> {
    return this.userAdminService.grantRole(admin, params.userId, body.role);
  }

  @Delete(':userId/roles/:role')
  revokeRole(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(userRoleParamsSchema)) params: UserRoleParams,
  ): Promise<AdminUserView> {
    return this.userAdminService.revokeRole(admin, params.userId, params.role);
  }
}
