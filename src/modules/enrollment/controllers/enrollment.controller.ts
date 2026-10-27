import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { Paged } from '../../audit/services/audit.service';
import {
  AdminGrantInput,
  adminGrantSchema,
  CourseIdParams,
  courseIdParamsSchema,
  EnrollmentIdParams,
  enrollmentIdParamsSchema,
  ListEnrollmentsQuery,
  listEnrollmentsQuerySchema,
  RevokeEnrollmentInput,
  revokeEnrollmentSchema,
} from '../schemas/enrollment.schema';
import { DashboardEntry, EnrollmentService, EnrollmentView } from '../services/enrollment.service';

/** Students: free enrollment (#47) and their dashboard (#52). */
@Controller()
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post('courses/:courseId/enroll')
  @HttpCode(200)
  enroll(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<EnrollmentView> {
    return this.enrollmentService.enrollFree(user, params.courseId);
  }

  @Get('me/enrollments')
  dashboard(@CurrentUser() user: AuthUser): Promise<DashboardEntry[]> {
    return this.enrollmentService.dashboard(user);
  }
}

/** #50: teachers see enrollments in their own courses (view only). */
@Roles([Role.TEACHER])
@Controller('teacher/courses/:courseId/enrollments')
export class TeacherEnrollmentsController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Query(new ZodValidationPipe(listEnrollmentsQuerySchema)) query: ListEnrollmentsQuery,
  ): Promise<Paged<EnrollmentView>> {
    return this.enrollmentService.listForTeacher(user, params.courseId, query);
  }
}

/** #49 and enrollment administration. */
@Roles([Role.ADMIN])
@Controller('admin/enrollments')
export class AdminEnrollmentsController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get()
  list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(listEnrollmentsQuerySchema)) query: ListEnrollmentsQuery,
  ): Promise<Paged<EnrollmentView>> {
    return this.enrollmentService.listForAdmin(admin, query);
  }

  @Post()
  grant(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(adminGrantSchema)) body: AdminGrantInput,
  ): Promise<EnrollmentView> {
    return this.enrollmentService.adminGrant(admin, body);
  }

  @Post(':enrollmentId/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(enrollmentIdParamsSchema)) params: EnrollmentIdParams,
    @Body(new ZodValidationPipe(revokeEnrollmentSchema)) body: RevokeEnrollmentInput,
  ): Promise<EnrollmentView> {
    return this.enrollmentService.adminRevoke(admin, params.enrollmentId, body);
  }
}
