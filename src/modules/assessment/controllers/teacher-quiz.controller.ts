import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UPLOAD_POLICIES } from '../../storage/domain/upload-policy';
import {
  CreateQuestionInput,
  createQuestionSchema,
  CreateQuizInput,
  createQuizSchema,
  QuestionOrderInput,
  questionOrderSchema,
  QuestionParams,
  questionParamsSchema,
  QuizParams,
  quizParamsSchema,
  UpdateQuestionInput,
  updateQuestionSchema,
  UpdateQuizInput,
  updateQuizSchema,
} from '../schemas/quiz.schema';
import { QuizBuilderService, TeacherQuizView } from '../services/quiz-builder.service';

/** #68–#72, #76: the quiz builder for a QUIZ lesson of the teacher's own course. */
@Roles([Role.TEACHER])
@Controller('teacher/courses/:courseId/lessons/:lessonId/quiz')
export class TeacherQuizController {
  constructor(private readonly builder: QuizBuilderService) {}

  /** Also the staff preview: correct answers included, nothing recorded. */
  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
  ): Promise<TeacherQuizView> {
    return this.builder.getForTeacher(user, params.courseId, params.lessonId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
    @Body(new ZodValidationPipe(createQuizSchema)) body: CreateQuizInput,
  ): Promise<TeacherQuizView> {
    return this.builder.createQuiz(user, params.courseId, params.lessonId, body);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
    @Body(new ZodValidationPipe(updateQuizSchema)) body: UpdateQuizInput,
  ): Promise<TeacherQuizView> {
    return this.builder.updateQuiz(user, params.courseId, params.lessonId, body);
  }

  @Delete()
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
  ): Promise<{ lessonId: string; deleted: true }> {
    return this.builder.deleteQuiz(user, params.courseId, params.lessonId);
  }

  @Post('questions')
  addQuestion(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
    @Body(new ZodValidationPipe(createQuestionSchema)) body: CreateQuestionInput,
  ): Promise<TeacherQuizView> {
    return this.builder.addQuestion(user, params.courseId, params.lessonId, body);
  }

  /** Declared before :questionId routes so "order" is not read as an id. */
  @Put('questions/order')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
    @Body(new ZodValidationPipe(questionOrderSchema)) body: QuestionOrderInput,
  ): Promise<TeacherQuizView> {
    return this.builder.reorderQuestions(user, params.courseId, params.lessonId, body.questionIds);
  }

  @Patch('questions/:questionId')
  updateQuestion(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(questionParamsSchema)) params: QuestionParams,
    @Body(new ZodValidationPipe(updateQuestionSchema)) body: UpdateQuestionInput,
  ): Promise<TeacherQuizView> {
    return this.builder.updateQuestion(
      user,
      params.courseId,
      params.lessonId,
      params.questionId,
      body,
    );
  }

  @Delete('questions/:questionId')
  deleteQuestion(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(questionParamsSchema)) params: QuestionParams,
  ): Promise<TeacherQuizView> {
    return this.builder.deleteQuestion(user, params.courseId, params.lessonId, params.questionId);
  }

  /** #72: multipart field `file`; PNG, JPEG or WebP up to 2 MB. Replaces any existing image. */
  @Put('questions/:questionId/image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_POLICIES.QUESTION_IMAGE.maxBytes, files: 1, fields: 0 },
    }),
  )
  setImage(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(questionParamsSchema)) params: QuestionParams,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<TeacherQuizView> {
    return this.builder.setQuestionImage(
      user,
      params.courseId,
      params.lessonId,
      params.questionId,
      file,
    );
  }

  @Delete('questions/:questionId/image')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(questionParamsSchema)) params: QuestionParams,
  ): Promise<TeacherQuizView> {
    return this.builder.removeQuestionImage(
      user,
      params.courseId,
      params.lessonId,
      params.questionId,
    );
  }
}

/** Admins read a course's quizzes while reviewing it (#28). Read only. */
@Roles([Role.ADMIN])
@Controller('admin/courses/:courseId/lessons/:lessonId/quiz')
export class AdminQuizController {
  constructor(private readonly builder: QuizBuilderService) {}

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
  ): Promise<TeacherQuizView> {
    return this.builder.getForAdmin(user, params.courseId, params.lessonId);
  }
}
