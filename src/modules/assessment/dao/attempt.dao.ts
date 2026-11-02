import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { questionSelect } from './quiz.dao';

const takingQuizSelect = {
  id: true,
  lessonId: true,
  timeLimitSeconds: true,
  maxAttempts: true,
  isBreakpoint: true,
  passingScorePct: true,
  revealAnswers: true,
  questions: { select: questionSelect, orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.QuizSelect;

const attemptSelect = {
  id: true,
  quizId: true,
  studentId: true,
  attemptNumber: true,
  scorePct: true,
  isPassed: true,
  startedAt: true,
  submittedAt: true,
  responses: {
    select: {
      questionId: true,
      studentAnswer: true,
      isCorrect: true,
      marksAwarded: true,
    },
  },
} satisfies Prisma.QuizAttemptSelect;

export type TakingQuizRecord = Prisma.QuizGetPayload<{ select: typeof takingQuizSelect }>;
export type AttemptRecord = Prisma.QuizAttemptGetPayload<{ select: typeof attemptSelect }>;

export interface ResponseData {
  questionId: string;
  studentAnswer: string | null;
  isCorrect: boolean;
  marksAwarded: number;
}

/**
 * Quiz attempts and responses (#73, #74). Attempts are the student's own records: every read is
 * keyed by `studentId`. `getQuizForTaking` reads a teacher's quiz without a TeacherScope; callers
 * use it only after ContentAccessService has authorised the student for the lesson.
 */
@Injectable()
export class AttemptDao {
  constructor(private readonly prisma: PrismaService) {}

  getQuizForTaking(lessonId: string, tx?: TransactionClient): Promise<TakingQuizRecord | null> {
    return (tx ?? this.prisma).quiz.findUnique({ where: { lessonId }, select: takingQuizSelect });
  }

  /** The student's attempts at a quiz, oldest first. */
  getAttemptsBy(
    studentId: string,
    quizId: string,
    tx?: TransactionClient,
  ): Promise<AttemptRecord[]> {
    return (tx ?? this.prisma).quizAttempt.findMany({
      where: { studentId, quizId },
      select: attemptSelect,
      orderBy: { attemptNumber: 'asc' },
    });
  }

  getAttemptBy(
    studentId: string,
    quizId: string,
    attemptId: string,
    tx?: TransactionClient,
  ): Promise<AttemptRecord | null> {
    return (tx ?? this.prisma).quizAttempt.findFirst({
      where: { id: attemptId, studentId, quizId },
      select: attemptSelect,
    });
  }

  /** The (attempt_number) unique constraint refuses a concurrent duplicate start. */
  createAttempt(
    data: { studentId: string; quizId: string; attemptNumber: number; startedAt: Date },
    tx: TransactionClient,
  ): Promise<AttemptRecord> {
    return tx.quizAttempt.create({ data, select: attemptSelect });
  }

  /**
   * Locks the attempt row if it is still open (SELECT ... FOR UPDATE), so a save and a close of
   * the same attempt never interleave. False when it is already closed.
   */
  async lockOpenAttempt(attemptId: string, tx: TransactionClient): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM quiz_attempts
      WHERE id = ${attemptId} AND submitted_at IS NULL
      FOR UPDATE`;
    return rows.length > 0;
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    studentAnswer: string | null,
    tx: TransactionClient,
  ): Promise<void> {
    await tx.questionResponse.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { attemptId, questionId, studentAnswer },
      update: { studentAnswer },
      select: { id: true },
    });
  }

  /** Answers saved so far (read inside the transaction holding the attempt lock). */
  getSavedAnswers(
    attemptId: string,
    tx: TransactionClient,
  ): Promise<{ questionId: string; studentAnswer: string | null }[]> {
    return tx.questionResponse.findMany({
      where: { attemptId },
      select: { questionId: true, studentAnswer: true },
    });
  }

  /** Replaces the saved answers with the graded set (one row per current question). */
  async replaceResponses(
    attemptId: string,
    responses: ResponseData[],
    tx: TransactionClient,
  ): Promise<void> {
    await tx.questionResponse.deleteMany({ where: { attemptId } });
    await tx.questionResponse.createMany({
      data: responses.map((response) => ({ ...response, attemptId })),
    });
  }

  async closeAttempt(
    attemptId: string,
    data: { submittedAt: Date; scorePct: number; isPassed: boolean | null },
    tx: TransactionClient,
  ): Promise<void> {
    await tx.quizAttempt.update({ where: { id: attemptId }, data, select: { id: true } });
  }

  /** The student's open attempts at timed quizzes of a course (to close expired ones). */
  getOpenTimedAttempts(studentId: string, courseId: string) {
    return this.prisma.quizAttempt.findMany({
      where: {
        studentId,
        submittedAt: null,
        quiz: { timeLimitSeconds: { not: null }, lesson: { section: { courseId } } },
      },
      select: {
        id: true,
        startedAt: true,
        quiz: { select: { lessonId: true, timeLimitSeconds: true } },
      },
    });
  }

  /** Lesson ids of the course's quizzes where the student has a closed attempt (passed if asked). */
  async getAttemptedLessonIds(
    studentId: string,
    courseId: string,
    onlyPassed: boolean,
  ): Promise<string[]> {
    const rows = await this.prisma.quiz.findMany({
      where: {
        lesson: { section: { courseId } },
        attempts: {
          some: {
            studentId,
            submittedAt: { not: null },
            ...(onlyPassed ? { isPassed: true } : {}),
          },
        },
      },
      select: { lessonId: true },
    });
    return rows.map((r) => r.lessonId);
  }

  /** Lesson ids of the course's checkpoint (breakpoint) quizzes. */
  async getBreakpointLessonIds(courseId: string): Promise<string[]> {
    const rows = await this.prisma.quiz.findMany({
      where: { isBreakpoint: true, lesson: { section: { courseId } } },
      select: { lessonId: true },
    });
    return rows.map((r) => r.lessonId);
  }
}
