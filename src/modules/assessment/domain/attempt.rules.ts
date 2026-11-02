import { DomainError } from '../../../common/errors/domain.error';
import { parseDecimal, withinTolerance } from './decimal.rules';
import type { QuestionTypeValue, RevealValue } from './quiz.rules';

/**
 * Taking a quiz (#73, #74, #76). Pure: every time-dependent rule takes `now` from the server.
 */

export class AttemptRefusedError extends DomainError {
  readonly code = 'QUIZ_ATTEMPT_REFUSED';
}

export class AttemptClosedError extends DomainError {
  readonly code = 'QUIZ_ATTEMPT_CLOSED';
}

export class InvalidAnswerError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

// ── Timer (#73) ──────────────────────────────────────────────────────

/**
 * Network allowance after the deadline. An answer the student sent just before time ran out may
 * reach the server a little later; anything arriving after deadline + grace is ignored.
 */
export const DEADLINE_GRACE_SECONDS = 15;

/** The deadline shown to the student: started_at + time limit. Null when untimed. */
export function attemptDeadline(startedAt: Date, timeLimitSeconds: number | null): Date | null {
  return timeLimitSeconds === null ? null : new Date(startedAt.getTime() + timeLimitSeconds * 1000);
}

/** True while answers still count: untimed, or now <= deadline + grace. Server time only. */
export function acceptsAnswers(
  startedAt: Date,
  timeLimitSeconds: number | null,
  now: Date,
): boolean {
  const deadline = attemptDeadline(startedAt, timeLimitSeconds);
  if (!deadline) return true;
  return now.getTime() <= deadline.getTime() + DEADLINE_GRACE_SECONDS * 1000;
}

// ── Starting (#74) ───────────────────────────────────────────────────

export interface StartFacts {
  maxAttempts: number | null;
  questionCount: number;
  /** Every attempt the student has made at this quiz, open or closed. */
  attemptNumbers: number[];
  /** An attempt still open and within its time (expired ones are closed before asking). */
  openAttemptId: string | null;
}

export type StartDecision =
  { kind: 'RESUME'; attemptId: string } | { kind: 'START'; attemptNumber: number };

/** One open attempt at a time (it is resumed); max_attempts counts every attempt started. */
export function decideStartAttempt(facts: StartFacts): StartDecision {
  if (facts.openAttemptId) return { kind: 'RESUME', attemptId: facts.openAttemptId };
  if (facts.questionCount === 0) {
    throw new AttemptRefusedError('This quiz has no questions yet', { reason: 'NO_QUESTIONS' });
  }
  if (facts.maxAttempts !== null && facts.attemptNumbers.length >= facts.maxAttempts) {
    throw new AttemptRefusedError('You have used all your attempts at this quiz', {
      reason: 'NO_ATTEMPTS_LEFT',
      maxAttempts: facts.maxAttempts,
    });
  }
  return { kind: 'START', attemptNumber: Math.max(0, ...facts.attemptNumbers) + 1 };
}

export function attemptsRemaining(maxAttempts: number | null, attemptsUsed: number): number | null {
  return maxAttempts === null ? null : Math.max(0, maxAttempts - attemptsUsed);
}

// ── Answers and grading (#69, #70, #74) ──────────────────────────────

export interface GradableQuestion {
  id: string;
  type: QuestionTypeValue;
  /** MCQ option ids. */
  optionIds: string[];
  correctAnswer: string;
  /** NUMERIC: absolute tolerance as a decimal string. */
  numericTolerance: string | null;
  marks: number;
}

/**
 * Checks and normalises one saved answer. MCQ: one of the question's option ids. NUMERIC: a
 * plain decimal ("9.81", "-0.5"); the unit is displayed, never typed or parsed.
 */
export function normaliseAnswer(question: GradableQuestion, answer: string): string {
  const value = answer.trim();
  if (question.type === 'MCQ') {
    if (!question.optionIds.includes(value)) {
      throw new InvalidAnswerError('Choose one of the options', { questionId: question.id });
    }
    return value;
  }
  if (!parseDecimal(value)) {
    throw new InvalidAnswerError('Enter a number, such as 9.81 or -0.5', {
      questionId: question.id,
    });
  }
  return value;
}

export function isAnswerCorrect(question: GradableQuestion, answer: string | null): boolean {
  if (answer === null) return false;
  if (question.type === 'MCQ') return answer === question.correctAnswer;
  const given = parseDecimal(answer);
  const target = parseDecimal(question.correctAnswer);
  const tolerance = parseDecimal(question.numericTolerance ?? '0');
  if (!given || !target || !tolerance) return false;
  return withinTolerance(given, target, tolerance);
}

export interface GradedResponse {
  questionId: string;
  studentAnswer: string | null;
  isCorrect: boolean;
  marksAwarded: number;
}

export interface Grade {
  responses: GradedResponse[];
  marksAwarded: number;
  totalMarks: number;
  /** Rounded down, so a displayed score never overstates the result. */
  scorePct: number;
  /** Null when the quiz has no passing score. Compared exactly, not on the rounded score. */
  isPassed: boolean | null;
}

/** Grades every current question; an unanswered question is recorded as wrong with 0 marks. */
export function gradeAttempt(
  questions: GradableQuestion[],
  answers: ReadonlyMap<string, string | null>,
  passingScorePct: number | null,
): Grade {
  const responses = questions.map((question) => {
    const studentAnswer = answers.get(question.id) ?? null;
    const isCorrect = isAnswerCorrect(question, studentAnswer);
    return {
      questionId: question.id,
      studentAnswer,
      isCorrect,
      marksAwarded: isCorrect ? question.marks : 0,
    };
  });
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const marksAwarded = responses.reduce((sum, r) => sum + r.marksAwarded, 0);
  const scorePct = totalMarks === 0 ? 0 : Math.floor((marksAwarded * 100) / totalMarks);
  const isPassed =
    passingScorePct === null
      ? null
      : totalMarks > 0 && marksAwarded * 100 >= passingScorePct * totalMarks;
  return { responses, marksAwarded, totalMarks, scorePct, isPassed };
}

// ── Reveal (#76) ─────────────────────────────────────────────────────

export interface RevealFacts {
  reveal: RevealValue;
  /** The attempt being viewed has been submitted or closed at its deadline. */
  attemptClosed: boolean;
  /** The student has passed this quiz in any closed attempt. */
  hasPassed: boolean;
  maxAttempts: number | null;
  /** Attempts the student has started (open or closed). */
  attemptsUsed: number;
  /** The student has an attempt still in progress. */
  hasOpenAttempt: boolean;
}

/**
 * Whether a student's closed attempt shows correct answers, per-question marking and
 * explanations. The score and pass/fail are always shown once the attempt is closed.
 * - NEVER: never.
 * - AFTER_ATTEMPT: as soon as the attempt is closed.
 * - AFTER_PASS: once the student has passed the quiz (then on every closed attempt).
 * - AFTER_FINAL_ATTEMPT: once no attempts remain and none is in progress.
 * An open attempt never reveals anything.
 */
export function canRevealAnswers(facts: RevealFacts): boolean {
  if (!facts.attemptClosed) return false;
  switch (facts.reveal) {
    case 'NEVER':
      return false;
    case 'AFTER_ATTEMPT':
      return true;
    case 'AFTER_PASS':
      return facts.hasPassed;
    case 'AFTER_FINAL_ATTEMPT':
      return (
        facts.maxAttempts !== null &&
        facts.attemptsUsed >= facts.maxAttempts &&
        !facts.hasOpenAttempt
      );
  }
}
