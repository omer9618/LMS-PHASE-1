import { z } from 'zod';
import { id, isoDateTime, openEnum } from './common';
import { lessonType, pacing } from './catalogue';

/** The course player (#53) and quiz taking (#75). */

export const lessonStateName = z.enum(['COMPLETED', 'AVAILABLE', 'LOCKED']);
export type LessonStateName = z.infer<typeof lessonStateName>;

export const completionSource = openEnum(['AUTO', 'MANUAL', 'QUIZ']);
export type CompletionSource = z.infer<typeof completionSource>;

export const lessonLock = z.object({
  cause: openEnum(['CHECKPOINT_NOT_PASSED', 'PREVIOUS_LESSON_INCOMPLETE']),
  blockingLessonId: id,
  blockingLessonTitle: z.string(),
  message: z.string(),
});
export type LessonLock = z.infer<typeof lessonLock>;

/** POST .../complete */
export const completion = z.object({ source: completionSource, completedAt: isoDateTime });
export type Completion = z.infer<typeof completion>;

export const learnerLesson = z.object({
  id,
  title: z.string(),
  type: lessonType,
  isFreePreview: z.boolean(),
  durationSeconds: z.number().nonnegative().nullable(),
  isCheckpoint: z.boolean(),
  passingScorePct: z.number().nullable(),
  state: lessonStateName,
  lock: lessonLock.nullable(),
  completion: completion.nullable(),
  resumePositionSeconds: z.number().nonnegative().nullable(),
});
export type LearnerLesson = z.infer<typeof learnerLesson>;

/** GET /learn/courses/:courseId */
export const learnerOutline = z.object({
  courseId: id,
  title: z.string(),
  progressionMode: pacing,
  /** STAFF: the course's teacher or an admin previewing; nothing is recorded. */
  viewer: z.enum(['STUDENT', 'STAFF']),
  currentLessonId: id.nullable(),
  completedLessons: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  completionPercent: z.number().min(0).max(100),
  sections: z.array(z.object({ id, title: z.string(), lessons: z.array(learnerLesson) })),
});
export type LearnerOutline = z.infer<typeof learnerOutline>;

/** GET /courses/:courseId/lessons/:lessonId/content */
export const lessonContent = z.object({
  id,
  title: z.string(),
  type: lessonType,
  bodyText: z.string().nullable(),
  resources: z.array(
    z.object({ id, fileName: z.string(), fileSizeBytes: z.number().nonnegative().nullable() }),
  ),
});
export type LessonContent = z.infer<typeof lessonContent>;

/** GET .../resources/:resourceId/download */
export const resourceDownload = z.object({
  url: z.string(),
  expiresInSeconds: z.number().nonnegative(),
});

/** PUT .../watch */
export const watchProgress = z.object({
  lessonId: id,
  lastPositionSeconds: z.number().nonnegative(),
  maxPositionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative().nullable(),
  completion: completion.nullable(),
});
export type WatchProgress = z.infer<typeof watchProgress>;

// ── Quizzes (#75) ──

export const revealAnswers = z.enum([
  'NEVER',
  'AFTER_ATTEMPT',
  'AFTER_PASS',
  'AFTER_FINAL_ATTEMPT',
]);
export type RevealAnswers = z.infer<typeof revealAnswers>;

export const attemptSummary = z.object({
  id,
  attemptNumber: z.number().int().positive(),
  status: z.enum(['IN_PROGRESS', 'SUBMITTED']),
  startedAt: isoDateTime,
  submittedAt: isoDateTime.nullable(),
  scorePct: z.number().nullable(),
  isPassed: z.boolean().nullable(),
});
export type AttemptSummary = z.infer<typeof attemptSummary>;

/** GET .../quiz */
export const quizOverview = z.object({
  quizId: id,
  lessonId: id,
  timeLimitSeconds: z.number().int().positive().nullable(),
  maxAttempts: z.number().int().positive().nullable(),
  isBreakpoint: z.boolean(),
  passingScorePct: z.number().nullable(),
  revealAnswers,
  questionCount: z.number().int().nonnegative(),
  totalMarks: z.number().nonnegative(),
  attemptsUsed: z.number().int().nonnegative(),
  attemptsRemaining: z.number().int().nonnegative().nullable(),
  hasPassed: z.boolean(),
  openAttemptId: id.nullable(),
  attempts: z.array(attemptSummary),
});
export type QuizOverview = z.infer<typeof quizOverview>;

export const attemptQuestion = z.object({
  id,
  type: z.enum(['MCQ', 'NUMERIC']),
  contentText: z.string(),
  imageUrl: z.string().nullable(),
  options: z.array(z.object({ id, text: z.string() })).nullable(),
  numericUnit: z.string().nullable(),
  marks: z.number().nonnegative(),
  yourAnswer: z.string().nullable(),
  /** Present only when the quiz's reveal rule allows. */
  isCorrect: z.boolean().optional(),
  marksAwarded: z.number().nonnegative().optional(),
  correctAnswer: z.string().optional(),
  numericTolerance: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
});
export type AttemptQuestion = z.infer<typeof attemptQuestion>;

/** An attempt with its questions (start, get, save, submit). */
export const attemptView = attemptSummary.extend({
  serverTime: isoDateTime,
  deadline: isoDateTime.nullable(),
  timedOut: z.boolean(),
  answersRevealed: z.boolean(),
  questions: z.array(attemptQuestion),
});
export type AttemptView = z.infer<typeof attemptView>;
