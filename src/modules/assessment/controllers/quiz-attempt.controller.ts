import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  AttemptParams,
  attemptParamsSchema,
  SaveAnswersInput,
  saveAnswersSchema,
  SubmitAttemptInput,
  submitAttemptSchema,
} from '../schemas/attempt.schema';
import { QuizParams, quizParamsSchema } from '../schemas/quiz.schema';
import { AttemptView, QuizAttemptService, QuizOverview } from '../services/quiz-attempt.service';

/** #73, #74, #76: taking a quiz. Access follows the lesson (ContentAccessService). */
@Controller('courses/:courseId/lessons/:lessonId/quiz')
export class QuizAttemptController {
  constructor(private readonly attempts: QuizAttemptService) {}

  /** Settings, limits and the caller's attempts. Questions come with an attempt. */
  @Get()
  overview(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
  ): Promise<QuizOverview> {
    return this.attempts.overview(user, params.courseId, params.lessonId);
  }

  /** Starts an attempt, or returns the one in progress. */
  @Post('attempts')
  start(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(quizParamsSchema)) params: QuizParams,
  ): Promise<AttemptView> {
    return this.attempts.start(user, params.courseId, params.lessonId);
  }

  @Get('attempts/:attemptId')
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(attemptParamsSchema)) params: AttemptParams,
  ): Promise<AttemptView> {
    return this.attempts.get(user, params.courseId, params.lessonId, params.attemptId);
  }

  @Put('attempts/:attemptId/answers')
  save(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(attemptParamsSchema)) params: AttemptParams,
    @Body(new ZodValidationPipe(saveAnswersSchema)) body: SaveAnswersInput,
  ): Promise<AttemptView> {
    return this.attempts.saveAnswers(
      user,
      params.courseId,
      params.lessonId,
      params.attemptId,
      body.answers,
    );
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(attemptParamsSchema)) params: AttemptParams,
    @Body(new ZodValidationPipe(submitAttemptSchema)) body: SubmitAttemptInput,
  ): Promise<AttemptView> {
    return this.attempts.submit(
      user,
      params.courseId,
      params.lessonId,
      params.attemptId,
      body.answers,
    );
  }
}
