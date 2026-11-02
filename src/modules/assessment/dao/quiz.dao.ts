import { Injectable } from '@nestjs/common';
import { Prisma, QuestionType, RevealAnswers } from '@prisma/client';
import { scopeWhere, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

export const questionSelect = {
  id: true,
  quizId: true,
  type: true,
  contentText: true,
  contentImageUrl: true,
  options: true,
  correctAnswer: true,
  numericTolerance: true,
  numericUnit: true,
  marks: true,
  explanation: true,
  orderIndex: true,
} satisfies Prisma.QuestionSelect;

export const quizSelect = {
  id: true,
  lessonId: true,
  timeLimitSeconds: true,
  maxAttempts: true,
  isBreakpoint: true,
  passingScorePct: true,
  revealAnswers: true,
  createdAt: true,
  questions: { select: questionSelect, orderBy: { orderIndex: 'asc' } },
  _count: { select: { attempts: true } },
} satisfies Prisma.QuizSelect;

export type QuestionRecord = Prisma.QuestionGetPayload<{ select: typeof questionSelect }>;
export type QuizRecord = Prisma.QuizGetPayload<{ select: typeof quizSelect }>;

export interface QuizSettingsData {
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  isBreakpoint: boolean;
  passingScorePct: number | null;
  revealAnswers: RevealAnswers;
}

export interface QuestionData {
  type: QuestionType;
  contentText: string;
  /** MCQ options ({ id, text }[]); null for numeric questions. */
  options: { id: string; text: string }[] | null;
  correctAnswer: string;
  numericTolerance: string | null;
  numericUnit: string | null;
  marks: number;
  explanation: string | null;
}

/**
 * Quizzes and their questions (#68). Teacher-owned through lesson → section → course: reads take
 * the TeacherScope and constrain through the course, so another teacher's quiz does not match
 * (#14). Writes are by id, after the service has loaded the record in scope.
 */
@Injectable()
export class QuizDao {
  constructor(private readonly prisma: PrismaService) {}

  getQuizBy(
    scope: TeacherScope,
    courseId: string,
    lessonId: string,
    tx?: TransactionClient,
  ): Promise<QuizRecord | null> {
    return (tx ?? this.prisma).quiz.findFirst({
      where: { lessonId, lesson: { section: { course: { id: courseId, ...scopeWhere(scope) } } } },
      select: quizSelect,
    });
  }

  createQuiz(
    lessonId: string,
    data: QuizSettingsData,
    tx?: TransactionClient,
  ): Promise<QuizRecord> {
    return (tx ?? this.prisma).quiz.create({ data: { ...data, lessonId }, select: quizSelect });
  }

  async updateQuiz(
    quizId: string,
    data: Partial<QuizSettingsData>,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).quiz.update({ where: { id: quizId }, data, select: { id: true } });
  }

  async deleteQuiz(quizId: string, tx: TransactionClient): Promise<void> {
    await tx.quiz.delete({ where: { id: quizId }, select: { id: true } });
  }

  countAttempts(quizId: string, tx?: TransactionClient): Promise<number> {
    return (tx ?? this.prisma).quizAttempt.count({ where: { quizId } });
  }

  /** Question ids in order. */
  async getQuestionIds(quizId: string, tx: TransactionClient): Promise<string[]> {
    const rows = await tx.question.findMany({
      where: { quizId },
      select: { id: true },
      orderBy: { orderIndex: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  async createQuestion(
    quizId: string,
    data: QuestionData & { orderIndex: number },
    tx: TransactionClient,
  ): Promise<void> {
    await tx.question.create({
      data: { ...data, options: jsonOrDbNull(data.options), quizId },
      select: { id: true },
    });
  }

  async updateQuestion(
    questionId: string,
    data: Partial<QuestionData> & { contentImageUrl?: string | null },
    tx?: TransactionClient,
  ): Promise<void> {
    const { options, ...rest } = data;
    await (tx ?? this.prisma).question.update({
      where: { id: questionId },
      data: options === undefined ? rest : { ...rest, options: jsonOrDbNull(options) },
      select: { id: true },
    });
  }

  async deleteQuestion(questionId: string, tx: TransactionClient): Promise<void> {
    await tx.question.delete({ where: { id: questionId }, select: { id: true } });
  }

  /** Writes positions 0..n-1 in the given order (the caller validated the set). */
  async setQuestionOrder(orderedIds: string[], tx: TransactionClient): Promise<void> {
    for (const [orderIndex, id] of orderedIds.entries()) {
      await tx.question.update({ where: { id }, data: { orderIndex }, select: { id: true } });
    }
  }

  countResponsesFor(questionId: string, tx: TransactionClient): Promise<number> {
    return tx.questionResponse.count({ where: { questionId } });
  }
}

function jsonOrDbNull(
  options: { id: string; text: string }[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return options === null ? Prisma.DbNull : options;
}
