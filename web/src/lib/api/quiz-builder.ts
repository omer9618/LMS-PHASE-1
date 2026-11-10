import type { QuestionInput, QuizSettingsInput } from '@/lib/forms/quiz';
import { api } from './client';
import * as schema from './schemas/teacher';

/**
 * Teacher quiz builder (#68–#74). Every change answers with the whole quiz. The form schemas are
 * in `lib/forms/quiz.ts`.
 */

export type { QuestionType, QuizQuestion, TeacherQuiz } from './schemas/teacher';

const quizPath = (courseId: string, lessonId: string) =>
  `/teacher/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/quiz`;

/** An update never sends `type`: a question's type cannot change. */
function withoutType(input: QuestionInput) {
  const { type: _type, ...body } = input;
  return body;
}

export const quizBuilderApi = {
  get: (courseId: string, lessonId: string, signal?: AbortSignal) =>
    api.get(quizPath(courseId, lessonId), schema.teacherQuiz, undefined, signal),
  create: (courseId: string, lessonId: string, settings: QuizSettingsInput) =>
    api.post(quizPath(courseId, lessonId), schema.teacherQuiz, settings),
  update: (courseId: string, lessonId: string, settings: QuizSettingsInput) =>
    api.patch(quizPath(courseId, lessonId), schema.teacherQuiz, settings),
  remove: (courseId: string, lessonId: string) =>
    api.delete(quizPath(courseId, lessonId), schema.quizDeleted),
  addQuestion: (courseId: string, lessonId: string, input: QuestionInput) =>
    api.post(`${quizPath(courseId, lessonId)}/questions`, schema.teacherQuiz, input),
  updateQuestion: (courseId: string, lessonId: string, questionId: string, input: QuestionInput) =>
    api.patch(
      `${quizPath(courseId, lessonId)}/questions/${encodeURIComponent(questionId)}`,
      schema.teacherQuiz,
      withoutType(input),
    ),
  deleteQuestion: (courseId: string, lessonId: string, questionId: string) =>
    api.delete(
      `${quizPath(courseId, lessonId)}/questions/${encodeURIComponent(questionId)}`,
      schema.teacherQuiz,
    ),
  orderQuestions: (courseId: string, lessonId: string, questionIds: string[]) =>
    api.put(`${quizPath(courseId, lessonId)}/questions/order`, schema.teacherQuiz, {
      questionIds,
    }),
};
