import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  ArchiveCourseInput,
  archiveCourseSchema,
  CourseIdParams,
  courseIdParamsSchema,
  EnrollmentToggleInput,
  enrollmentToggleSchema,
  ListCoursesForReviewQuery,
  listCoursesForReviewQuerySchema,
  RejectCourseInput,
  rejectCourseSchema,
  SetPricingInput,
  setPricingSchema,
  UnpublishCourseInput,
  unpublishCourseSchema,
  UpdateCourseDetailsInput,
  updateCourseDetailsSchema,
} from '../schemas/course.schema';
import { Outline, OutlineService } from '../services/outline.service';
import { CourseView, CourseService } from '../services/course.service';

/** Admin review queue (#28) and pricing (#29). */
@Roles([Role.ADMIN])
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(
    private readonly courseService: CourseService,
    private readonly outlineService: OutlineService,
  ) {}

  @Get()
  list(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(listCoursesForReviewQuerySchema)) query: ListCoursesForReviewQuery,
  ): Promise<CourseView[]> {
    return this.courseService.listCoursesForReview(admin, query);
  }

  @Get(':courseId')
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<CourseView> {
    return this.courseService.getCourseForReview(admin, params.courseId);
  }

  @Put(':courseId/pricing')
  setPricing(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(setPricingSchema)) body: SetPricingInput,
  ): Promise<CourseView> {
    return this.courseService.setPricing(admin, params.courseId, body);
  }

  @Post(':courseId/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<CourseView> {
    return this.courseService.approveCourse(admin, params.courseId);
  }

  @Post(':courseId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(rejectCourseSchema)) body: RejectCourseInput,
  ): Promise<CourseView> {
    return this.courseService.rejectCourse(admin, params.courseId, body);
  }

  @Get(':courseId/outline')
  outline(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<Outline> {
    return this.outlineService.getOutlineForAdmin(admin, params.courseId);
  }

  /** #26: admins can correct details, including on a published course. */
  @Patch(':courseId')
  update(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(updateCourseDetailsSchema)) body: UpdateCourseDetailsInput,
  ): Promise<CourseView> {
    return this.courseService.updateCourseAsAdmin(admin, params.courseId, body);
  }

  /** #28: back to draft with a reason; the teacher is emailed. */
  @Post(':courseId/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(unpublishCourseSchema)) body: UnpublishCourseInput,
  ): Promise<CourseView> {
    return this.courseService.unpublishCourse(admin, params.courseId, body);
  }

  @Post(':courseId/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(archiveCourseSchema)) body: ArchiveCourseInput,
  ): Promise<CourseView> {
    return this.courseService.archiveCourseAsAdmin(admin, params.courseId, body);
  }

  @Put(':courseId/enrollment')
  setEnrollment(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(enrollmentToggleSchema)) body: EnrollmentToggleInput,
  ): Promise<CourseView> {
    return this.courseService.setCourseEnrollmentAsAdmin(admin, params.courseId, body.open);
  }
}
