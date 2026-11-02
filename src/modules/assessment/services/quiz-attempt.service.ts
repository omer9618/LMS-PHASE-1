import { Injectable } from '@nestjs/common';
import { QuestionType, RevealAnswers, Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { ContentAccessService } from '../../content/services/content-access.service';
import { AttemptDao, AttemptRecord, TakingQuizRecord } from '../dao/attempt.dao';
import {
  acceptsAnswers,
  AttemptClosedError,
  attemptDeadline,
  attemptsRemaining,
  canRevealAnswers,
  decideStartAttempt,
  DEADLINE_GRACE_SECONDS,
  InvalidAnswerError,
  normaliseAnswer,
} from '../domain/attempt.rules';
import { readOptions } from '../domain/quiz.rules';
import { AttemptGradingService, gradable } from './attempt-grading.service';
import { QuestionImageService } from './question-image.service';

type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED';

export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: Date;
  submittedAt: Date | null;
  scorePct: number | null;
  isPassed: boolean | null;
}

export interface QuizOverview {
  quizId: string;
  lessonId: string;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  isBreakpoint: boolean;
  passingScorePct: number | null;
  revealAnswers: RevealAnswers;
  questionCount: number;
  totalMarks: number;
  attemptsUsed: number;
  /** Null when attempts are unlimited. */
  attemptsRemaining: number | null;
  hasPassed: boolean;
  openAttemptId: string | null;
  attempts: AttemptSummary[];
}

export interface AttemptQuestionView {
  id: string;
  type: QuestionType;
  contentText: string;
  imageUrl: string | null;
  /** MCQ only: ids and text, never which one is correct. */
  options: { id: string; text: string }[] | null;
  numericUnit: string | null;
  marks: number;
  yourAnswer: string | null;
  /** The fields below are present only when the reveal rule (#76) allows. */
  isCorrect?: boolean;
  marksAwarded?: number;
  correctAnswer?: string;
  numericTolerance?: string | null;
  explanation?: string | null;
}

export interface AttemptView extends AttemptSummary {
  /** started_at + time limit; null when untimed. Answers reaching the server later are ignored. */
  deadline: Date | null;
  /** Closed at the deadline rather than by the student's own submit in time. */
  timedOut: boolean;
  answersRevealed: boolean;
  questions: AttemptQuestionView[];
}

interface Authorised {
  quiz: TakingQuizRecord;
  isStaff: boolean;
}

/**
 * Taking a quiz (#73, #74, #76). Access is the lesson's: enrolled students of a published (or
 * archived) course, anyone signed in for a free-preview lesson of a published course, and staff,
 * through ContentAccessService. Staff (the course's teacher, admins) see the overview but do not
 * record attempts: they preview through the builder, which shows the answers.
 *
 * Time is the server's only. An attempt open past deadline + grace is closed (graded on the
 * answers saved in time) the next time anything touches it.
 */
@Injectable()
export class QuizAttemptService {
  constructor(
    private readonly attemptDao: AttemptDao,
    private readonly access: ContentAccessService,
    private readonly images: QuestionImageService,
    private readonly grading: AttemptGradingService,
    private readonly transactions: TransactionService,
  ) {}

  async overview(user: AuthUser, courseId: string, lessonId: string): Promise<QuizOverview> {
    const { quiz } = await this.authorise(user, courseId, lessonId);
    const attempts = await this.settledAttempts(user.id, quiz, new Date());
    const open = attempts.find((a) => a.submittedAt === null) ?? null;
    return {
      quizId: quiz.id,
      lessonId: quiz.lessonId,
      timeLimitSeconds: quiz.timeLimitSeconds,
      maxAttempts: quiz.maxAttempts,
      isBreakpoint: quiz.isBreakpoint,
      passingScorePct: quiz.passingScorePct,
      revealAnswers: quiz.revealAnswers,
      questionCount: quiz.questions.length,
      totalMarks: quiz.questions.reduce((sum, q) => sum + q.marks, 0),
      attemptsUsed: attempts.length,
      attemptsRemaining: attemptsRemaining(quiz.maxAttempts, attempts.length),
      hasPassed: attempts.some((a) => a.isPassed === true),
      openAttemptId: open?.id ?? null,
      attempts: attempts.map(summary),
    };
  }

  /** Starts an attempt (started_at = server time), or resumes the one in progress. */
  async start(user: AuthUser, courseId: string, lessonId: string): Promise<AttemptView> {
    const { quiz, isStaff } = await this.authorise(user, courseId, lessonId);
    if (isStaff) {
      throw new AppException(ErrorCode.FORBIDDEN, { reason: 'STAFF_PREVIEW' }, undefined, {
        message: 'Staff preview quizzes in the builder; attempts are recorded for students only',
      });
    }
    const now = new Date();
    const attempts = await this.settledAttempts(user.id, quiz, now);
    const decision = decideStartAttempt({
      maxAttempts: quiz.maxAttempts,
      questionCount: quiz.questions.length,
      attemptNumbers: attempts.map((a) => a.attemptNumber),
      openAttemptId: attempts.find((a) => a.submittedAt === null)?.id ?? null,
    });
    const attemptId =
      decision.kind === 'RESUME'
        ? decision.attemptId
        : (
            await this.transactions.run((tx) =>
              this.attemptDao.createAttempt(
                {
                  studentId: user.id,
                  quizId: quiz.id,
                  attemptNumber: decision.attemptNumber,
                  startedAt: now,
                },
                tx,
              ),
            )
          ).id;
    return this.attemptView(user.id, quiz, attemptId);
  }

  async get(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    attemptId: string,
  ): Promise<AttemptView> {
    const { quiz } = await this.authorise(user, courseId, lessonId);
    const attempt = await this.loadAttempt(user.id, quiz, attemptId);
    await this.grading.closeIfExpired(quiz, attempt, new Date());
    return this.attemptView(user.id, quiz, attemptId);
  }

  /** Progressive save. Refused once the attempt is closed or past its deadline (+ grace). */
  async saveAnswers(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    attemptId: string,
    answers: { questionId: string; answer: string | null }[],
  ): Promise<AttemptView> {
    const { quiz } = await this.authorise(user, courseId, lessonId);
    const attempt = await this.loadAttempt(user.id, quiz, attemptId);
    const now = new Date();
    if (attempt.submittedAt !== null) {
      throw new AttemptClosedError('This attempt has already been submitted', { attemptId });
    }
    if (await this.grading.closeIfExpired(quiz, attempt, now)) {
      throw new AttemptClosedError(
        'Time is up. Answers sent after the deadline are not counted; the attempt has been submitted.',
        { attemptId },
      );
    }
    const normalised = normaliseAll(quiz, answers);
    await this.transactions.run(async (tx) => {
      if (!(await this.attemptDao.lockOpenAttempt(attemptId, tx))) {
        throw new AttemptClosedError('This attempt has already been submitted', { attemptId });
      }
      await this.saveAll(attemptId, normalised, tx);
    });
    return this.attemptView(user.id, quiz, attemptId);
  }

  /**
   * Submits and grades. Answers sent with the submit count only if it arrives before the deadline
   * (+ grace); after it, the attempt is graded on what was saved in time. Submitting a closed
   * attempt again returns its result.
   */
  async submit(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    attemptId: string,
    answers: { questionId: string; answer: string | null }[] | undefined,
  ): Promise<AttemptView> {
    const { quiz } = await this.authorise(user, courseId, lessonId);
    const attempt = await this.loadAttempt(user.id, quiz, attemptId);
    const now = new Date();
    if (attempt.submittedAt === null) {
      const inTime = acceptsAnswers(attempt.startedAt, quiz.timeLimitSeconds, now);
      const normalised = inTime && answers ? normaliseAll(quiz, answers) : [];
      await this.transactions.run(async (tx) => {
        if (!(await this.attemptDao.lockOpenAttempt(attemptId, tx))) return;
        await this.saveAll(attemptId, normalised, tx);
        await this.grading.gradeAndClose(quiz, attemptId, now, tx);
      });
    }
    return this.attemptView(user.id, quiz, attemptId);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async authorise(user: AuthUser, courseId: string, lessonId: string): Promise<Authorised> {
    const lesson = await this.access.assertCanPlay(user, courseId, lessonId);
    const quiz = lesson.type === 'QUIZ' ? await this.attemptDao.getQuizForTaking(lessonId) : null;
    if (!quiz) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'quiz', lessonId });
    const isStaff = user.id === lesson.section.course.teacherId || user.roles.has(Role.ADMIN);
    return { quiz, isStaff };
  }

  private async loadAttempt(
    studentId: string,
    quiz: TakingQuizRecord,
    attemptId: string,
  ): Promise<AttemptRecord> {
    const attempt = await this.attemptDao.getAttemptBy(studentId, quiz.id, attemptId);
    if (!attempt) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'attempt', id: attemptId });
    return attempt;
  }

  /** The student's attempts, after closing any left open past its deadline. */
  private async settledAttempts(
    studentId: string,
    quiz: TakingQuizRecord,
    now: Date,
  ): Promise<AttemptRecord[]> {
    const attempts = await this.attemptDao.getAttemptsBy(studentId, quiz.id);
    let closed = false;
    for (const attempt of attempts) {
      closed = (await this.grading.closeIfExpired(quiz, attempt, now)) || closed;
    }
    return closed ? this.attemptDao.getAttemptsBy(studentId, quiz.id) : attempts;
  }

  private async saveAll(
    attemptId: string,
    answers: { questionId: string; answer: string | null }[],
    tx: TransactionClient,
  ): Promise<void> {
    for (const { questionId, answer } of answers) {
      await this.attemptDao.saveAnswer(attemptId, questionId, answer, tx);
    }
  }

  private async attemptView(
    studentId: string,
    quiz: TakingQuizRecord,
    attemptId: string,
  ): Promise<AttemptView> {
    const attempts = await this.attemptDao.getAttemptsBy(studentId, quiz.id);
    const attempt = attempts.find((a) => a.id === attemptId);
    if (!attempt) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'attempt', id: attemptId });
    const closed = attempt.submittedAt !== null;
    const revealed = canRevealAnswers({
      reveal: quiz.revealAnswers,
      attemptClosed: closed,
      hasPassed: attempts.some((a) => a.isPassed === true),
      maxAttempts: quiz.maxAttempts,
      attemptsUsed: attempts.length,
      hasOpenAttempt: attempts.some((a) => a.submittedAt === null),
    });
    const responses = new Map(attempt.responses.map((r) => [r.questionId, r]));
    // A closed attempt shows the questions it was graded on; an open one, the current questions.
    const questions = closed ? quiz.questions.filter((q) => responses.has(q.id)) : quiz.questions;
    const deadline = attemptDeadline(attempt.startedAt, quiz.timeLimitSeconds);

    return {
      ...summary(attempt),
      deadline,
      timedOut:
        deadline !== null &&
        attempt.submittedAt !== null &&
        attempt.submittedAt.getTime() > deadline.getTime() + DEADLINE_GRACE_SECONDS * 1000,
      answersRevealed: revealed,
      questions: await Promise.all(
        questions.map(async (q) => {
          const response = responses.get(q.id);
          const view: AttemptQuestionView = {
            id: q.id,
            type: q.type,
            contentText: q.contentText,
            imageUrl: await this.images.signedUrl(q.contentImageUrl),
            options: q.type === 'MCQ' ? readOptions(q.options) : null,
            numericUnit: q.numericUnit,
            marks: q.marks,
            yourAnswer: response?.studentAnswer ?? null,
          };
          if (revealed) {
            view.isCorrect = response?.isCorrect ?? false;
            view.marksAwarded = response?.marksAwarded ?? 0;
            view.correctAnswer = q.correctAnswer;
            view.numericTolerance = q.numericTolerance?.toFixed() ?? null;
            view.explanation = q.explanation;
          }
          return view;
        }),
      ),
    };
  }
}

function summary(attempt: AttemptRecord): AttemptSummary {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.submittedAt === null ? 'IN_PROGRESS' : 'SUBMITTED',
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    scorePct: attempt.scorePct,
    isPassed: attempt.isPassed,
  };
}

/** Validates every answer against its question before anything is written. */
function normaliseAll(
  quiz: TakingQuizRecord,
  answers: { questionId: string; answer: string | null }[],
): { questionId: string; answer: string | null }[] {
  const byId = new Map(quiz.questions.map((q) => [q.id, gradable(q)]));
  const seen = new Set<string>();
  return answers.map(({ questionId, answer }) => {
    const question = byId.get(questionId);
    if (!question || seen.has(questionId)) {
      throw new InvalidAnswerError('Unknown or repeated question', { questionId });
    }
    seen.add(questionId);
    const trimmed = answer?.trim() ?? '';
    return { questionId, answer: trimmed === '' ? null : normaliseAnswer(question, trimmed) };
  });
}
