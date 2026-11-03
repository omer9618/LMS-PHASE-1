import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { QuestionType, RevealAnswers } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { CourseService } from '../../courses/services/course.service';
import { OutlineService } from '../../courses/services/outline.service';
import type { IncomingFile } from '../../storage/services/storage.service';
import { QuestionRecord, QuizDao, QuizRecord } from '../dao/quiz.dao';
import {
  assertCanAddQuestion,
  assertQuestionDeletable,
  assertQuizDeletable,
  DEFAULT_QUIZ_SETTINGS,
  planNewQuestion,
  planQuestionOrder,
  planQuestionUpdate,
  planQuizSettings,
  QuestionDraft,
  QuizSettings,
  readOptions,
} from '../domain/quiz.rules';
import type {
  CreateQuestionInput,
  CreateQuizInput,
  UpdateQuestionInput,
  UpdateQuizInput,
} from '../schemas/quiz.schema';
import { QuestionImageService } from './question-image.service';

export interface TeacherQuestionView {
  id: string;
  type: QuestionType;
  orderIndex: number;
  contentText: string;
  /** Signed, short-lived; null when the question has no image. */
  imageUrl: string | null;
  /** MCQ only. */
  options: { id: string; text: string; isCorrect: boolean }[] | null;
  /** MCQ: the correct option id. NUMERIC: the exact decimal answer. */
  correctAnswer: string;
  /** NUMERIC only: absolute tolerance as a decimal string. */
  numericTolerance: string | null;
  numericUnit: string | null;
  marks: number;
  explanation: string | null;
}

export interface TeacherQuizView {
  id: string;
  lessonId: string;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  isBreakpoint: boolean;
  passingScorePct: number | null;
  revealAnswers: RevealAnswers;
  createdAt: Date;
  /** Attempts by students. While above 0, the quiz and answered questions cannot be deleted. */
  attemptCount: number;
  totalMarks: number;
  questions: TeacherQuestionView[];
}

/**
 * Teacher quiz builder (#68–#72). A quiz belongs to a QUIZ lesson of the teacher's own course and
 * is editable while the course content is (DRAFT or PUBLISHED), through
 * OutlineService.loadEditableLesson. Every change returns the whole quiz, as the outline does.
 *
 * The builder view is also the staff preview: it shows the correct answers and records nothing.
 */
@Injectable()
export class QuizBuilderService {
  constructor(
    private readonly quizDao: QuizDao,
    private readonly outline: OutlineService,
    private readonly courses: CourseService,
    private readonly images: QuestionImageService,
    private readonly transactions: TransactionService,
  ) {}

  async getForTeacher(
    user: AuthUser,
    courseId: string,
    lessonId: string,
  ): Promise<TeacherQuizView> {
    return this.view(await this.loadQuiz(teacherScope(user), courseId, lessonId));
  }

  /** Admins read quizzes while reviewing a course (#28). */
  async getForAdmin(admin: AuthUser, courseId: string, lessonId: string): Promise<TeacherQuizView> {
    const scope = adminScope(admin);
    await this.courses.loadInScope(scope, courseId);
    return this.view(await this.loadQuiz(scope, courseId, lessonId));
  }

  async createQuiz(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    input: CreateQuizInput,
  ): Promise<TeacherQuizView> {
    const lesson = await this.outline.loadEditableLesson(user, courseId, lessonId);
    if (lesson.type !== 'QUIZ') {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'lessonId' }, undefined, {
        message: 'Quizzes can only be added to quiz lessons',
      });
    }
    const settings = planQuizSettings(DEFAULT_QUIZ_SETTINGS, input);
    if (await this.quizDao.getQuizBy(teacherScope(user), courseId, lessonId)) {
      throw new AppException(ErrorCode.CONFLICT, { entity: 'quiz', lessonId }, undefined, {
        message: 'This lesson already has a quiz',
      });
    }
    return this.view(await this.quizDao.createQuiz(lessonId, settings));
  }

  async updateQuiz(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    input: UpdateQuizInput,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const settings = planQuizSettings(settingsOf(quiz), input);
    await this.quizDao.updateQuiz(quiz.id, settings);
    return this.reload(scope, courseId, lessonId);
  }

  /** Refused once students have attempted it: their work is never deleted silently. */
  async deleteQuiz(
    user: AuthUser,
    courseId: string,
    lessonId: string,
  ): Promise<{ lessonId: string; deleted: true }> {
    const { quiz } = await this.editableQuiz(user, courseId, lessonId);
    await this.transactions.run(async (tx) => {
      assertQuizDeletable(await this.quizDao.countAttempts(quiz.id, tx));
      await this.quizDao.deleteQuiz(quiz.id, tx);
    });
    await this.images.deleteQuietly(quiz.questions.map((q) => q.contentImageUrl));
    return { lessonId, deleted: true };
  }

  async addQuestion(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    input: CreateQuestionInput,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const draft = planNewQuestion(input, newOptionId);
    await this.transactions.run(async (tx) => {
      const ids = await this.quizDao.getQuestionIds(quiz.id, tx);
      assertCanAddQuestion(ids.length);
      await this.quizDao.createQuestion(quiz.id, { ...draft, orderIndex: ids.length }, tx);
    });
    return this.reload(scope, courseId, lessonId);
  }

  /**
   * Edits apply to future grading only: recorded attempts keep the correctness and marks they
   * were graded with. The question type never changes.
   */
  async updateQuestion(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    questionId: string,
    input: UpdateQuestionInput,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const question = findQuestion(quiz, questionId);
    const change = planQuestionUpdate(draftOf(question), input, newOptionId);
    if (Object.keys(change).length > 0) await this.quizDao.updateQuestion(question.id, change);
    return this.reload(scope, courseId, lessonId);
  }

  async deleteQuestion(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    questionId: string,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const question = findQuestion(quiz, questionId);
    await this.transactions.run(async (tx) => {
      assertQuestionDeletable(await this.quizDao.countResponsesFor(question.id, tx));
      await this.quizDao.deleteQuestion(question.id, tx);
      await this.quizDao.setQuestionOrder(await this.quizDao.getQuestionIds(quiz.id, tx), tx);
    });
    await this.images.deleteQuietly([question.contentImageUrl]);
    return this.reload(scope, courseId, lessonId);
  }

  async reorderQuestions(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    questionIds: string[],
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    await this.transactions.run(async (tx) => {
      const current = await this.quizDao.getQuestionIds(quiz.id, tx);
      await this.quizDao.setQuestionOrder(planQuestionOrder(current, questionIds), tx);
    });
    return this.reload(scope, courseId, lessonId);
  }

  /** #72: attaches (or replaces) the question's image. */
  async setQuestionImage(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    questionId: string,
    file: IncomingFile | undefined,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const question = findQuestion(quiz, questionId);
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'file' }, undefined, {
        message: 'An image file is required',
      });
    }
    const stored = await this.images.store(quiz.id, file);
    try {
      await this.quizDao.updateQuestion(question.id, { contentImageUrl: stored.key });
    } catch (error) {
      await this.images.deleteQuietly([stored.key]);
      throw error;
    }
    // After the row points at the new file: a failed delete leaves an orphan, never a broken link.
    await this.images.deleteQuietly([question.contentImageUrl]);
    return this.reload(scope, courseId, lessonId);
  }

  async removeQuestionImage(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    questionId: string,
  ): Promise<TeacherQuizView> {
    const { scope, quiz } = await this.editableQuiz(user, courseId, lessonId);
    const question = findQuestion(quiz, questionId);
    if (question.contentImageUrl) {
      await this.quizDao.updateQuestion(question.id, { contentImageUrl: null });
      await this.images.deleteQuietly([question.contentImageUrl]);
    }
    return this.reload(scope, courseId, lessonId);
  }

  // ── Internals ─────────────────────────────────────────────────────

  /** The quiz of a lesson in the teacher's own course, while its content is editable. */
  private async editableQuiz(
    user: AuthUser,
    courseId: string,
    lessonId: string,
  ): Promise<{ scope: TeacherScope; quiz: QuizRecord }> {
    await this.outline.loadEditableLesson(user, courseId, lessonId);
    const scope = teacherScope(user);
    return { scope, quiz: await this.loadQuiz(scope, courseId, lessonId) };
  }

  private async loadQuiz(
    scope: TeacherScope,
    courseId: string,
    lessonId: string,
    tx?: TransactionClient,
  ): Promise<QuizRecord> {
    const quiz = await this.quizDao.getQuizBy(scope, courseId, lessonId, tx);
    if (!quiz) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'quiz', lessonId });
    return quiz;
  }

  private async reload(
    scope: TeacherScope,
    courseId: string,
    lessonId: string,
  ): Promise<TeacherQuizView> {
    return this.view(await this.loadQuiz(scope, courseId, lessonId));
  }

  private async view(quiz: QuizRecord): Promise<TeacherQuizView> {
    const questions = await Promise.all(
      quiz.questions.map(async (q) => ({
        id: q.id,
        type: q.type,
        orderIndex: q.orderIndex,
        contentText: q.contentText,
        imageUrl: await this.images.signedUrl(q.contentImageUrl),
        options:
          q.type === 'MCQ'
            ? readOptions(q.options).map((o) => ({ ...o, isCorrect: o.id === q.correctAnswer }))
            : null,
        correctAnswer: q.correctAnswer,
        numericTolerance: q.numericTolerance?.toFixed() ?? null,
        numericUnit: q.numericUnit,
        marks: q.marks,
        explanation: q.explanation,
      })),
    );
    return {
      ...settingsOf(quiz),
      id: quiz.id,
      lessonId: quiz.lessonId,
      createdAt: quiz.createdAt,
      attemptCount: quiz._count.attempts,
      totalMarks: quiz.questions.reduce((sum, q) => sum + q.marks, 0),
      questions,
    };
  }
}

function settingsOf(quiz: QuizRecord): QuizSettings & { revealAnswers: RevealAnswers } {
  return {
    timeLimitSeconds: quiz.timeLimitSeconds,
    maxAttempts: quiz.maxAttempts,
    isBreakpoint: quiz.isBreakpoint,
    passingScorePct: quiz.passingScorePct,
    revealAnswers: quiz.revealAnswers,
  };
}

function draftOf(question: QuestionRecord): QuestionDraft {
  return {
    type: question.type,
    contentText: question.contentText,
    options: question.type === 'MCQ' ? readOptions(question.options) : null,
    correctAnswer: question.correctAnswer,
    numericTolerance: question.numericTolerance?.toFixed() ?? null,
    numericUnit: question.numericUnit,
    marks: question.marks,
    explanation: question.explanation,
  };
}

function findQuestion(quiz: QuizRecord, questionId: string): QuestionRecord {
  const question = quiz.questions.find((q) => q.id === questionId);
  if (!question)
    throw new AppException(ErrorCode.NOT_FOUND, { entity: 'question', id: questionId });
  return question;
}

/** Option ids are short random strings, stable across edits. */
function newOptionId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}
