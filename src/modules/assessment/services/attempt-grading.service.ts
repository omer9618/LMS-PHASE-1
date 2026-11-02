import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AttemptDao, TakingQuizRecord } from '../dao/attempt.dao';
import type { QuestionRecord } from '../dao/quiz.dao';
import { acceptsAnswers, GradableQuestion, gradeAttempt } from '../domain/attempt.rules';
import { readOptions } from '../domain/quiz.rules';

/**
 * Closing and grading attempts (#73, #74). Has no access checks and no dependency on the content
 * module, so the progress module can depend on assessment results (through AssessmentService)
 * without a module cycle (content → progress → assessment core).
 */
@Injectable()
export class AttemptGradingService {
  constructor(
    private readonly attemptDao: AttemptDao,
    private readonly transactions: TransactionService,
  ) {}

  /**
   * Grades the saved answers against the current questions and closes the attempt: one response
   * per question, score_pct, is_passed and submitted_at. The caller holds the attempt lock.
   */
  async gradeAndClose(
    quiz: TakingQuizRecord,
    attemptId: string,
    now: Date,
    tx: TransactionClient,
  ): Promise<void> {
    const saved = new Map(
      (await this.attemptDao.getSavedAnswers(attemptId, tx)).map((r) => [
        r.questionId,
        r.studentAnswer,
      ]),
    );
    const grade = gradeAttempt(quiz.questions.map(gradable), saved, quiz.passingScorePct);
    await this.attemptDao.replaceResponses(attemptId, grade.responses, tx);
    await this.attemptDao.closeAttempt(
      attemptId,
      { submittedAt: now, scorePct: grade.scorePct, isPassed: grade.isPassed },
      tx,
    );
  }

  /** True if this call closed the attempt because its time had run out. */
  async closeIfExpired(
    quiz: TakingQuizRecord,
    attempt: { id: string; startedAt: Date; submittedAt: Date | null },
    now: Date,
  ): Promise<boolean> {
    if (attempt.submittedAt !== null) return false;
    if (acceptsAnswers(attempt.startedAt, quiz.timeLimitSeconds, now)) return false;
    return this.transactions.run(async (tx) => {
      if (!(await this.attemptDao.lockOpenAttempt(attempt.id, tx))) return false;
      await this.gradeAndClose(quiz, attempt.id, now, tx);
      return true;
    });
  }

  /**
   * Closes the student's open attempts in a course whose deadline has passed. Used before
   * reporting results to other modules, so an abandoned timed attempt still counts.
   */
  async closeExpiredAttemptsInCourse(
    studentId: string,
    courseId: string,
    now: Date,
  ): Promise<void> {
    const open = await this.attemptDao.getOpenTimedAttempts(studentId, courseId);
    for (const attempt of open) {
      if (acceptsAnswers(attempt.startedAt, attempt.quiz.timeLimitSeconds, now)) continue;
      const quiz = await this.attemptDao.getQuizForTaking(attempt.quiz.lessonId);
      if (quiz) await this.closeIfExpired(quiz, { ...attempt, submittedAt: null }, now);
    }
  }
}

export function gradable(question: QuestionRecord): GradableQuestion {
  return {
    id: question.id,
    type: question.type,
    optionIds: readOptions(question.options).map((o) => o.id),
    correctAnswer: question.correctAnswer,
    numericTolerance: question.numericTolerance?.toFixed() ?? null,
    marks: question.marks,
  };
}
