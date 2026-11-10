import { api } from './client';
import { playback } from './schemas/catalogue';
import * as schema from './schemas/learn';

/**
 * Learner-side API: the course player (#53) and quiz taking (#75). Shapes mirror the API's
 * progress, content and assessment modules; dates are ISO strings.
 */

export type {
  AttemptQuestion,
  AttemptSummary,
  AttemptView,
  Completion,
  CompletionSource,
  LearnerLesson,
  LearnerOutline,
  LessonContent,
  LessonLock,
  LessonStateName,
  QuizOverview,
  RevealAnswers,
  WatchProgress,
} from './schemas/learn';

export interface AnswerInput {
  questionId: string;
  answer: string | null;
}

const lessonPath = (courseId: string, lessonId: string) =>
  `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;

const quiz = (c: string, l: string) => `${lessonPath(c, l)}/quiz`;

/** The browser's learner API. */
export const learn = {
  outline: (courseId: string) =>
    api.get(`/learn/courses/${encodeURIComponent(courseId)}`, schema.learnerOutline),
  content: (courseId: string, lessonId: string) =>
    api.get(`${lessonPath(courseId, lessonId)}/content`, schema.lessonContent),
  playback: (courseId: string, lessonId: string) =>
    api.get(`${lessonPath(courseId, lessonId)}/playback`, playback),
  resourceDownload: (courseId: string, lessonId: string, resourceId: string) =>
    api.get(
      `${lessonPath(courseId, lessonId)}/resources/${encodeURIComponent(resourceId)}/download`,
      schema.resourceDownload,
    ),
  reportWatch: (courseId: string, lessonId: string, positionSeconds: number) =>
    api.put(`${lessonPath(courseId, lessonId)}/watch`, schema.watchProgress, {
      positionSeconds,
    }),
  complete: (courseId: string, lessonId: string) =>
    api.post(`${lessonPath(courseId, lessonId)}/complete`, schema.completion),

  quizOverview: (c: string, l: string) => api.get(quiz(c, l), schema.quizOverview),
  startAttempt: (c: string, l: string) => api.post(`${quiz(c, l)}/attempts`, schema.attemptView),
  getAttempt: (c: string, l: string, attemptId: string) =>
    api.get(`${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}`, schema.attemptView),
  saveAnswers: (c: string, l: string, attemptId: string, answers: AnswerInput[]) =>
    api.put(`${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}/answers`, schema.attemptView, {
      answers,
    }),
  submitAttempt: (c: string, l: string, attemptId: string, answers: AnswerInput[]) =>
    api.post(`${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}/submit`, schema.attemptView, {
      answers,
    }),
};

export type LearnApi = typeof learn;
