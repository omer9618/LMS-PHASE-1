import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { CourseRecord } from '../dao/course.dao';
import {
  CourseIdParams,
  courseIdParamsSchema,
  CreateCourseInput,
  createCourseSchema,
  ListMyCoursesQuery,
  listMyCoursesQuerySchema,
  SubmitCourseInput,
  submitCourseSchema,
} from '../schemas/course.schema';
import { CourseService } from '../services/course.service';

/** A teacher's own courses. Scoping to the caller happens in the service/DAO, not here. */
@Roles([Role.TEACHER])
@Controller('teacher/courses')
export class TeacherCoursesController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
  ): Promise<CourseRecord> {
    return this.courseService.createCourse(user, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMyCoursesQuerySchema)) query: ListMyCoursesQuery,
  ): Promise<CourseRecord[]> {
    return this.courseService.listMyCourses(user, query);
  }

  @Get(':courseId')
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<CourseRecord> {
    return this.courseService.getMyCourse(user, params.courseId);
  }

  @Post(':courseId/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(submitCourseSchema)) body: SubmitCourseInput,
  ): Promise<CourseRecord> {
    return this.courseService.submitCourse(user, params.courseId, body);
  }
}
