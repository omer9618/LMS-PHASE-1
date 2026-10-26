import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CourseIdParams,
  courseIdParamsSchema,
  CreateCourseInput,
  createCourseSchema,
  EnrollmentToggleInput,
  enrollmentToggleSchema,
  ListMyCoursesQuery,
  listMyCoursesQuerySchema,
  SubmitCourseInput,
  submitCourseSchema,
  UpdateCourseDetailsInput,
  updateCourseDetailsSchema,
} from '../schemas/course.schema';
import { CourseView, CourseService } from '../services/course.service';

/** A teacher's own courses. Scoping to the caller happens in the service/DAO, not here. */
@Roles([Role.TEACHER])
@Controller('teacher/courses')
export class TeacherCoursesController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseInput,
  ): Promise<CourseView> {
    return this.courseService.createCourse(user, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMyCoursesQuerySchema)) query: ListMyCoursesQuery,
  ): Promise<CourseView[]> {
    return this.courseService.listMyCourses(user, query);
  }

  @Get(':courseId')
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<CourseView> {
    return this.courseService.getMyCourse(user, params.courseId);
  }

  @Post(':courseId/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(submitCourseSchema)) body: SubmitCourseInput,
  ): Promise<CourseView> {
    return this.courseService.submitCourse(user, params.courseId, body);
  }

  /** #26: details are editable while the course is a draft. */
  @Patch(':courseId')
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(updateCourseDetailsSchema)) body: UpdateCourseDetailsInput,
  ): Promise<CourseView> {
    return this.courseService.updateMyCourse(user, params.courseId, body);
  }

  @Post(':courseId/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<CourseView> {
    return this.courseService.archiveMyCourse(user, params.courseId);
  }

  @Delete(':courseId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<{ deleted: true }> {
    return this.courseService.deleteMyCourse(user, params.courseId);
  }

  /** #32: open or close enrollment. */
  @Put(':courseId/enrollment')
  setEnrollment(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(enrollmentToggleSchema)) body: EnrollmentToggleInput,
  ): Promise<CourseView> {
    return this.courseService.setMyCourseEnrollment(user, params.courseId, body.open);
  }
}
