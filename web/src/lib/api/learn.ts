import { api, type ApiClient } from './client';
import type { LessonType, Playback } from './types';

/**
 * Learner-side API: the course player (#53) and quiz taking (#75). Shapes mirror the API's
 * progress, content and assessment modules; dates are ISO strings.
 */

export type LessonStateName = 'COMPLETED' | 'AVAILABLE' | 'LOCKED';
export type CompletionSource = 'AUTO' | 'MANUAL' | 'QUIZ' | (string & {});

export interface LessonLock {
  cause: 'CHECKPOINT_NOT_PASSED' | 'PREVIOUS_LESSON_INCOMPLETE' | (string & {});
  blockingLessonId: string;
  blockingLessonTitle: string;
  message: string;
}

export interface Completion {
  source: CompletionSource;
  completedAt: string;
}

export interface LearnerLesson {
  id: string;
  title: string;
  type: LessonType;
  isFreePreview: boolean;
  durationSeconds: number | null;
  isCheckpoint: boolean;
  passingScorePct: number | null;
  state: LessonStateName;
  lock: LessonLock | null;
  completion: Completion | null;
  resumePositionSeconds: number | null;
}

/** GET /learn/courses/:courseId */
export interface LearnerOutline {
  courseId: string;
  title: string;
  progressionMode: 'FREE' | 'SEQUENTIAL';
  /** STAFF: the course's teacher or an admin previewing; nothing is recorded. */
  viewer: 'STUDENT' | 'STAFF';
  currentLessonId: string | null;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  sections: { id: string; title: string; lessons: LearnerLesson[] }[];
}

/** GET /courses/:courseId/lessons/:lessonId/content */
export interface LessonContent {
  id: string;
  title: string;
  type: LessonType;
  bodyText: string | null;
  resources: { id: string; fileName: string; fileSizeBytes: number | null }[];
}

export interface WatchProgress {
  lessonId: string;
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  durationSeconds: number | null;
  completion: Completion | null;
}

// ── Quizzes (#75) ─────────────────────────────────────────────────

export type RevealAnswers = 'NEVER' | 'AFTER_ATTEMPT' | 'AFTER_PASS' | 'AFTER_FINAL_ATTEMPT';

export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  submittedAt: string | null;
  scorePct: number | null;
  isPassed: boolean | null;
}

/** GET /courses/:courseId/lessons/:lessonId/quiz */
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
  attemptsRemaining: number | null;
  hasPassed: boolean;
  openAttemptId: string | null;
  attempts: AttemptSummary[];
}

export interface AttemptQuestion {
  id: string;
  type: 'MCQ' | 'NUMERIC';
  contentText: string;
  imageUrl: string | null;
  options: { id: string; text: string }[] | null;
  numericUnit: string | null;
  marks: number;
  yourAnswer: string | null;
  /** Present only when the quiz's reveal rule allows. */
  isCorrect?: boolean;
  marksAwarded?: number;
  correctAnswer?: string;
  numericTolerance?: string | null;
  explanation?: string | null;
}

export interface AttemptView extends AttemptSummary {
  serverTime: string;
  deadline: string | null;
  timedOut: boolean;
  answersRevealed: boolean;
  questions: AttemptQuestion[];
}

export interface AnswerInput {
  questionId: string;
  answer: string | null;
}

const lessonPath = (courseId: string, lessonId: string) =>
  `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;

export function learnApi(client: ApiClient = api) {
  const quiz = (c: string, l: string) => `${lessonPath(c, l)}/quiz`;
  return {
    outline: (courseId: string) =>
      client.get<LearnerOutline>(`/learn/courses/${encodeURIComponent(courseId)}`),
    content: (courseId: string, lessonId: string) =>
      client.get<LessonContent>(`${lessonPath(courseId, lessonId)}/content`),
    playback: (courseId: string, lessonId: string) =>
      client.get<Playback>(`${lessonPath(courseId, lessonId)}/playback`),
    resourceDownload: (courseId: string, lessonId: string, resourceId: string) =>
      client.get<{ url: string; expiresInSeconds: number }>(
        `${lessonPath(courseId, lessonId)}/resources/${encodeURIComponent(resourceId)}/download`,
      ),
    reportWatch: (courseId: string, lessonId: string, positionSeconds: number) =>
      client.request<WatchProgress>(`${lessonPath(courseId, lessonId)}/watch`, {
        method: 'PUT',
        body: { positionSeconds },
      }),
    complete: (courseId: string, lessonId: string) =>
      client.post<Completion>(`${lessonPath(courseId, lessonId)}/complete`),

    quizOverview: (c: string, l: string) => client.get<QuizOverview>(quiz(c, l)),
    startAttempt: (c: string, l: string) => client.post<AttemptView>(`${quiz(c, l)}/attempts`),
    getAttempt: (c: string, l: string, attemptId: string) =>
      client.get<AttemptView>(`${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}`),
    saveAnswers: (c: string, l: string, attemptId: string, answers: AnswerInput[]) =>
      client.request<AttemptView>(
        `${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}/answers`,
        { method: 'PUT', body: { answers } },
      ),
    submitAttempt: (c: string, l: string, attemptId: string, answers: AnswerInput[]) =>
      client.post<AttemptView>(`${quiz(c, l)}/attempts/${encodeURIComponent(attemptId)}/submit`, {
        answers,
      }),
  };
}

export type LearnApi = ReturnType<typeof learnApi>;

/** The browser's learner API. */
export const learn = learnApi();
