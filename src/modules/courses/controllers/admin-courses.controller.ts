import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CourseIdParams,
  courseIdParamsSchema,
  ListCoursesForReviewQuery,
  listCoursesForReviewQuerySchema,
  RejectCourseInput,
  rejectCourseSchema,
  SetPricingInput,
  setPricingSchema,
} from '../schemas/course.schema';
import { CourseView, CourseService } from '../services/course.service';

/** Admin review queue (#28) and pricing (#29). */
@Roles([Role.ADMIN])
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly courseService: CourseService) {}

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
}
