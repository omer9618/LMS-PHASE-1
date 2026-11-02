import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CourseParams,
  courseParamsSchema,
  LessonParams,
  lessonParamsSchema,
  RosterQuery,
  rosterQuerySchema,
  StudentProgressParams,
  studentProgressParamsSchema,
  WatchPositionInput,
  watchPositionSchema,
} from '../schemas/progress.schema';
import {
  Completion,
  LearnerOutline,
  ProgressService,
  WatchProgress,
} from '../services/progress.service';
import {
  CourseProgressReport,
  StudentProgressDetail,
  TeacherProgressService,
} from '../services/teacher-progress.service';

/** Learner outline (#94, #96, #97): enrolled students, and staff previewing their course. */
@Controller('learn/courses/:courseId')
export class LearnerOutlineController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  outline(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseParamsSchema)) params: CourseParams,
  ): Promise<LearnerOutline> {
    return this.progressService.learnerOutline(user, params.courseId);
  }
}

/** Watch position (#91, #92) and manual completion (#93), for enrolled students. */
@Controller('courses/:courseId/lessons/:lessonId')
export class LessonProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('watch')
  getWatch(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonParamsSchema)) params: LessonParams,
  ): Promise<WatchProgress> {
    return this.progressService.getWatch(user, params.courseId, params.lessonId);
  }

  @Put('watch')
  reportWatch(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonParamsSchema)) params: LessonParams,
    @Body(new ZodValidationPipe(watchPositionSchema)) body: WatchPositionInput,
  ): Promise<WatchProgress> {
    return this.progressService.reportWatch(
      user,
      params.courseId,
      params.lessonId,
      body.positionSeconds,
    );
  }

  @Post('complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(lessonParamsSchema)) params: LessonParams,
  ): Promise<Completion> {
    return this.progressService.completeManually(user, params.courseId, params.lessonId);
  }
}

/** #95: teachers see progress and quiz results in their own courses (view only). */
@Roles([Role.TEACHER])
@Controller('teacher/courses/:courseId/progress')
export class TeacherProgressController {
  constructor(private readonly teacherProgressService: TeacherProgressService) {}

  @Get()
  report(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(courseParamsSchema)) params: CourseParams,
    @Query(new ZodValidationPipe(rosterQuerySchema)) query: RosterQuery,
  ): Promise<CourseProgressReport> {
    return this.teacherProgressService.courseReport(user, params.courseId, query);
  }

  @Get('students/:studentId')
  student(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(studentProgressParamsSchema)) params: StudentProgressParams,
  ): Promise<StudentProgressDetail> {
    return this.teacherProgressService.studentDetail(user, params.courseId, params.studentId);
  }
}
