import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { Paged } from '../../audit/services/audit.service';
import {
  ApplicationIdParams,
  applicationIdParamsSchema,
  CreateTeacherFromApplicationInput,
  createTeacherFromApplicationSchema,
  LinkApplicationInput,
  linkApplicationSchema,
  ListApplicationsQuery,
  listApplicationsQuerySchema,
  ReviewApplicationInput,
  reviewApplicationSchema,
} from '../schemas/teacher-application.schema';
import {
  ApplicationRecord,
  TeacherApplicationService,
} from '../services/teacher-application.service';

/** #19–#21, #23: admin review of teacher applications. */
@Roles([Role.ADMIN])
@Controller('admin/teacher-applications')
export class AdminTeacherApplicationsController {
  constructor(private readonly applicationService: TeacherApplicationService) {}

  @Get()
  list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(listApplicationsQuerySchema)) query: ListApplicationsQuery,
  ): Promise<Paged<ApplicationRecord>> {
    return this.applicationService.list(admin, query);
  }

  /** Manual run of the daily purge (#23). Declared before :applicationId routes. */
  @Post('purge')
  @HttpCode(200)
  purge(@CurrentUser() admin: AuthUser): Promise<{ purged: number }> {
    return this.applicationService.purgeExpired(admin);
  }

  @Get(':applicationId')
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(applicationIdParamsSchema)) params: ApplicationIdParams,
  ): Promise<ApplicationRecord> {
    return this.applicationService.get(admin, params.applicationId);
  }

  @Get(':applicationId/cv')
  cv(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(applicationIdParamsSchema)) params: ApplicationIdParams,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.applicationService.cvDownloadUrl(admin, params.applicationId);
  }

  @Post(':applicationId/review')
  @HttpCode(200)
  review(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(applicationIdParamsSchema)) params: ApplicationIdParams,
    @Body(new ZodValidationPipe(reviewApplicationSchema)) body: ReviewApplicationInput,
  ): Promise<ApplicationRecord> {
    return this.applicationService.review(admin, params.applicationId, body);
  }

  @Post(':applicationId/account')
  createAccount(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(applicationIdParamsSchema)) params: ApplicationIdParams,
    @Body(new ZodValidationPipe(createTeacherFromApplicationSchema))
    body: CreateTeacherFromApplicationInput,
  ): Promise<ApplicationRecord> {
    return this.applicationService.createTeacherAccount(admin, params.applicationId, body);
  }

  @Post(':applicationId/link')
  @HttpCode(200)
  link(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(applicationIdParamsSchema)) params: ApplicationIdParams,
    @Body(new ZodValidationPipe(linkApplicationSchema)) body: LinkApplicationInput,
  ): Promise<ApplicationRecord> {
    return this.applicationService.link(admin, params.applicationId, body.userId);
  }
}
