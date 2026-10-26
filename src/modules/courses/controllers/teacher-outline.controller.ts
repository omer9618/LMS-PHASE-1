import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CourseIdParams, courseIdParamsSchema } from '../schemas/course.schema';
import {
  CourseLessonParams,
  courseLessonParamsSchema,
  CourseSectionParams,
  courseSectionParamsSchema,
  CreateLessonInput,
  createLessonSchema,
  LessonOrderInput,
  lessonOrderSchema,
  MoveLessonInput,
  moveLessonSchema,
  SectionInput,
  SectionOrderInput,
  sectionOrderSchema,
  sectionSchema,
  UpdateLessonInput,
  updateLessonSchema,
} from '../schemas/outline.schema';
import { Outline, OutlineService } from '../services/outline.service';

/** #27: a teacher's course outline: sections and lessons, with ordering. */
@Roles([Role.TEACHER])
@Controller('teacher/courses/:courseId')
export class TeacherOutlineController {
  constructor(private readonly outlineService: OutlineService) {}

  @Get('outline')
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
  ): Promise<Outline> {
    return this.outlineService.getOutline(user, params.courseId);
  }

  @Post('sections')
  createSection(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(sectionSchema)) body: SectionInput,
  ): Promise<Outline> {
    return this.outlineService.createSection(user, params.courseId, body);
  }

  /** Declared before :sectionId routes so "order" is not read as an id. */
  @Put('sections/order')
  reorderSections(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseIdParamsSchema)) params: CourseIdParams,
    @Body(new ZodValidationPipe(sectionOrderSchema)) body: SectionOrderInput,
  ): Promise<Outline> {
    return this.outlineService.reorderSections(user, params.courseId, body.sectionIds);
  }

  @Patch('sections/:sectionId')
  renameSection(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseSectionParamsSchema)) params: CourseSectionParams,
    @Body(new ZodValidationPipe(sectionSchema)) body: SectionInput,
  ): Promise<Outline> {
    return this.outlineService.renameSection(user, params.courseId, params.sectionId, body);
  }

  @Delete('sections/:sectionId')
  deleteSection(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseSectionParamsSchema)) params: CourseSectionParams,
  ): Promise<Outline> {
    return this.outlineService.deleteSection(user, params.courseId, params.sectionId);
  }

  @Post('sections/:sectionId/lessons')
  createLesson(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseSectionParamsSchema)) params: CourseSectionParams,
    @Body(new ZodValidationPipe(createLessonSchema)) body: CreateLessonInput,
  ): Promise<Outline> {
    return this.outlineService.createLesson(user, params.courseId, params.sectionId, body);
  }

  @Put('sections/:sectionId/lessons/order')
  reorderLessons(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseSectionParamsSchema)) params: CourseSectionParams,
    @Body(new ZodValidationPipe(lessonOrderSchema)) body: LessonOrderInput,
  ): Promise<Outline> {
    return this.outlineService.reorderLessons(
      user,
      params.courseId,
      params.sectionId,
      body.lessonIds,
    );
  }

  @Patch('lessons/:lessonId')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseLessonParamsSchema)) params: CourseLessonParams,
    @Body(new ZodValidationPipe(updateLessonSchema)) body: UpdateLessonInput,
  ): Promise<Outline> {
    return this.outlineService.updateLesson(user, params.courseId, params.lessonId, body);
  }

  @Delete('lessons/:lessonId')
  deleteLesson(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseLessonParamsSchema)) params: CourseLessonParams,
  ): Promise<Outline> {
    return this.outlineService.deleteLesson(user, params.courseId, params.lessonId);
  }

  @Post('lessons/:lessonId/move')
  @HttpCode(200)
  moveLesson(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseLessonParamsSchema)) params: CourseLessonParams,
    @Body(new ZodValidationPipe(moveLessonSchema)) body: MoveLessonInput,
  ): Promise<Outline> {
    return this.outlineService.moveLesson(user, params.courseId, params.lessonId, body);
  }
}
