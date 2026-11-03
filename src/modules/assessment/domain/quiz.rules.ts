import { DomainError } from '../../../common/errors/domain.error';
import { decimalShape, formatDecimal, parseDecimal } from './decimal.rules';

/**
 * Quiz builder rules (#68–#72, #76). Pure.
 *
 * A quiz belongs to one QUIZ lesson. Its questions are ordered (dense, 0-based `order_index`).
 * Question and option text may contain LaTeX between `$...$` or `$$...$$` (#71): it is stored and
 * returned exactly as written, and rendered by the web app. Only its length is checked.
 */
export type QuestionTypeValue = 'MCQ' | 'NUMERIC';
export type RevealValue = 'NEVER' | 'AFTER_ATTEMPT' | 'AFTER_PASS' | 'AFTER_FINAL_ATTEMPT';

export class InvalidQuizError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

/** Student work is never deleted silently. */
export class QuizLockedError extends DomainError {
  readonly code = 'QUIZ_LOCKED';
}

export const QUIZ_LIMITS = {
  minTimeLimitSeconds: 30,
  maxTimeLimitSeconds: 24 * 60 * 60,
  maxAttempts: 100,
  maxQuestions: 200,
  minOptions: 2,
  maxOptions: 10,
  maxMarks: 100,
  /** Text lengths (LaTeX included). */
  maxQuestionText: 5000,
  maxOptionText: 1000,
  maxExplanation: 5000,
  maxUnit: 30,
  /** numeric_tolerance is DECIMAL(18,6). */
  toleranceIntegerDigits: 12,
  toleranceFractionDigits: 6,
  /** correct_answer for numeric questions. */
  answerIntegerDigits: 15,
  answerFractionDigits: 10,
} as const;

// ── Settings ─────────────────────────────────────────────────────────

export interface QuizSettings {
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  isBreakpoint: boolean;
  passingScorePct: number | null;
  revealAnswers: RevealValue;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  timeLimitSeconds: null,
  maxAttempts: null,
  isBreakpoint: false,
  passingScorePct: null,
  revealAnswers: 'AFTER_ATTEMPT',
};

/** Applies a partial change and checks the combination. Returns the full new settings. */
export function planQuizSettings(
  current: QuizSettings,
  patch: Partial<QuizSettings>,
): QuizSettings {
  const next: QuizSettings = { ...current };
  for (const key of Object.keys(patch) as (keyof QuizSettings)[]) {
    if (patch[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = patch[key];
  }
  assertQuizSettings(next);
  return next;
}

export function assertQuizSettings(settings: QuizSettings): void {
  const { timeLimitSeconds, maxAttempts, passingScorePct } = settings;
  if (
    timeLimitSeconds !== null &&
    (!Number.isInteger(timeLimitSeconds) ||
      timeLimitSeconds < QUIZ_LIMITS.minTimeLimitSeconds ||
      timeLimitSeconds > QUIZ_LIMITS.maxTimeLimitSeconds)
  ) {
    throw new InvalidQuizError(
      `The time limit must be between ${QUIZ_LIMITS.minTimeLimitSeconds} seconds and 24 hours`,
      { field: 'timeLimitSeconds' },
    );
  }
  if (
    maxAttempts !== null &&
    (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > QUIZ_LIMITS.maxAttempts)
  ) {
    throw new InvalidQuizError(`Max attempts must be between 1 and ${QUIZ_LIMITS.maxAttempts}`, {
      field: 'maxAttempts',
    });
  }
  if (
    passingScorePct !== null &&
    (!Number.isInteger(passingScorePct) || passingScorePct < 1 || passingScorePct > 100)
  ) {
    throw new InvalidQuizError('The passing score must be between 1 and 100 percent', {
      field: 'passingScorePct',
    });
  }
  if (settings.isBreakpoint && passingScorePct === null) {
    throw new InvalidQuizError('A checkpoint quiz needs a passing score', {
      field: 'passingScorePct',
    });
  }
  if (settings.revealAnswers === 'AFTER_PASS' && passingScorePct === null) {
    throw new InvalidQuizError('Revealing answers after a pass needs a passing score', {
      field: 'passingScorePct',
    });
  }
  if (settings.revealAnswers === 'AFTER_FINAL_ATTEMPT' && maxAttempts === null) {
    throw new InvalidQuizError(
      'Revealing answers after the final attempt needs a maximum number of attempts',
      { field: 'maxAttempts' },
    );
  }
}

// ── Questions ────────────────────────────────────────────────────────

/** Stored in questions.options. `id` is stable across edits; correct_answer holds one of them. */
export interface McqOption {
  id: string;
  text: string;
}

export interface McqOptionInput {
  /** An existing option's id (keeps it stable); omit for a new option. */
  id?: string;
  text: string;
  isCorrect: boolean;
}

/** What a question row holds, apart from ids, order and image. */
export interface QuestionDraft {
  type: QuestionTypeValue;
  contentText: string;
  options: McqOption[] | null;
  correctAnswer: string;
  numericTolerance: string | null;
  numericUnit: string | null;
  marks: number;
  explanation: string | null;
}

export type NewQuestionInput =
  | {
      type: 'MCQ';
      contentText: string;
      options: McqOptionInput[];
      marks?: number;
      explanation?: string | null;
    }
  | {
      type: 'NUMERIC';
      contentText: string;
      correctAnswer: string;
      tolerance?: string;
      unit?: string | null;
      marks?: number;
      explanation?: string | null;
    };

export interface QuestionPatch {
  contentText?: string;
  explanation?: string | null;
  marks?: number;
  options?: McqOptionInput[];
  correctAnswer?: string;
  tolerance?: string;
  unit?: string | null;
}

/**
 * Validates MCQ options and assigns ids to new ones. Exactly one option is correct.
 * `existingIds` are the question's current option ids: a given id must be one of them.
 */
export function planMcqOptions(
  input: McqOptionInput[],
  existingIds: readonly string[],
  newId: () => string,
): { options: McqOption[]; correctAnswer: string } {
  if (input.length < QUIZ_LIMITS.minOptions || input.length > QUIZ_LIMITS.maxOptions) {
    throw new InvalidQuizError(
      `A multiple-choice question needs ${QUIZ_LIMITS.minOptions} to ${QUIZ_LIMITS.maxOptions} options`,
      { field: 'options' },
    );
  }
  const correct = input.filter((option) => option.isCorrect);
  if (correct.length !== 1) {
    throw new InvalidQuizError('Mark exactly one option as correct', { field: 'options' });
  }
  const known = new Set(existingIds);
  const seen = new Set<string>();
  const options = input.map((option) => {
    if (option.id !== undefined) {
      if (!known.has(option.id) || seen.has(option.id)) {
        throw new InvalidQuizError('Unknown or repeated option id', {
          field: 'options',
          id: option.id,
        });
      }
    }
    const id = option.id ?? newId();
    seen.add(id);
    return { id, text: option.text };
  });
  const correctIndex = input.indexOf(correct[0]);
  return { options, correctAnswer: options[correctIndex].id };
}

/** Reads the options JSON defensively; anything malformed is dropped. */
export function readOptions(json: unknown): McqOption[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { id, text } = item as { id?: unknown; text?: unknown };
    return typeof id === 'string' && typeof text === 'string' ? [{ id, text }] : [];
  });
}

function checkedDecimal(
  value: string,
  field: string,
  limits: { integerDigits: number; fractionDigits: number },
  allowNegative: boolean,
): string {
  const parsed = parseDecimal(value);
  if (!parsed) {
    throw new InvalidQuizError('Enter a plain decimal number, such as 9.81 or -0.5', { field });
  }
  if (!allowNegative && parsed.digits < 0n) {
    throw new InvalidQuizError('The value cannot be negative', { field });
  }
  const shape = decimalShape(parsed);
  if (shape.integerDigits > limits.integerDigits || shape.fractionDigits > limits.fractionDigits) {
    throw new InvalidQuizError(
      `At most ${limits.integerDigits} digits before and ${limits.fractionDigits} after the decimal point`,
      { field },
    );
  }
  return formatDecimal(parsed);
}

/** Numeric answer (#70): exact decimal, absolute tolerance (default 0) and a display-only unit. */
export function planNumericAnswer(input: {
  correctAnswer: string;
  tolerance?: string;
  unit?: string | null;
}): { correctAnswer: string; numericTolerance: string; numericUnit: string | null } {
  const correctAnswer = checkedDecimal(
    input.correctAnswer,
    'correctAnswer',
    {
      integerDigits: QUIZ_LIMITS.answerIntegerDigits,
      fractionDigits: QUIZ_LIMITS.answerFractionDigits,
    },
    true,
  );
  const numericTolerance = checkedDecimal(
    input.tolerance ?? '0',
    'tolerance',
    {
      integerDigits: QUIZ_LIMITS.toleranceIntegerDigits,
      fractionDigits: QUIZ_LIMITS.toleranceFractionDigits,
    },
    false,
  );
  const unit = input.unit?.trim();
  return { correctAnswer, numericTolerance, numericUnit: unit ? unit : null };
}

export function planNewQuestion(input: NewQuestionInput, newId: () => string): QuestionDraft {
  const common = {
    contentText: input.contentText,
    marks: input.marks ?? 1,
    explanation: input.explanation ?? null,
  };
  if (input.type === 'MCQ') {
    const { options, correctAnswer } = planMcqOptions(input.options, [], newId);
    return {
      ...common,
      type: 'MCQ',
      options,
      correctAnswer,
      numericTolerance: null,
      numericUnit: null,
    };
  }
  return { ...common, type: 'NUMERIC', options: null, ...planNumericAnswer(input) };
}

/** A question's type never changes; fields of the other type are refused. */
export function planQuestionUpdate(
  current: QuestionDraft,
  patch: QuestionPatch,
  newId: () => string,
): Partial<QuestionDraft> {
  const change: Partial<QuestionDraft> = {};
  if (patch.contentText !== undefined) change.contentText = patch.contentText;
  if (patch.explanation !== undefined) change.explanation = patch.explanation;
  if (patch.marks !== undefined) change.marks = patch.marks;

  const numericFields = ['correctAnswer', 'tolerance', 'unit'] as const;
  if (current.type === 'MCQ') {
    const wrong = numericFields.find((field) => patch[field] !== undefined);
    if (wrong) {
      throw new InvalidQuizError('Multiple-choice questions take options, not a numeric answer', {
        field: wrong,
      });
    }
    if (patch.options !== undefined) {
      const existing = (current.options ?? []).map((option) => option.id);
      Object.assign(change, planMcqOptions(patch.options, existing, newId));
    }
    return change;
  }

  if (patch.options !== undefined) {
    throw new InvalidQuizError('Numeric questions have no options', { field: 'options' });
  }
  if (numericFields.some((field) => patch[field] !== undefined)) {
    Object.assign(
      change,
      planNumericAnswer({
        correctAnswer: patch.correctAnswer ?? current.correctAnswer,
        tolerance: patch.tolerance ?? current.numericTolerance ?? '0',
        unit: patch.unit !== undefined ? patch.unit : current.numericUnit,
      }),
    );
  }
  return change;
}

// ── Ordering and deletion ────────────────────────────────────────────

/** A full reorder must name exactly the current questions, once each. */
export function planQuestionOrder(currentIds: string[], requestedIds: string[]): string[] {
  const current = new Set(currentIds);
  const requested = new Set(requestedIds);
  const sameSet =
    requested.size === requestedIds.length &&
    requested.size === current.size &&
    [...requested].every((id) => current.has(id));
  if (!sameSet) {
    throw new InvalidQuizError('The new order must list every question exactly once', {
      expected: currentIds.length,
      received: requestedIds.length,
    });
  }
  return requestedIds;
}

export function assertCanAddQuestion(questionCount: number): void {
  if (questionCount >= QUIZ_LIMITS.maxQuestions) {
    throw new InvalidQuizError(`A quiz can have at most ${QUIZ_LIMITS.maxQuestions} questions`);
  }
}

export function assertQuizDeletable(attempts: number): void {
  if (attempts > 0) {
    throw new QuizLockedError(
      'Students have attempted this quiz, so it cannot be deleted. Edit it instead.',
      { attempts },
    );
  }
}

export function assertQuestionDeletable(responses: number): void {
  if (responses > 0) {
    throw new QuizLockedError(
      'Students have answered this question, so it cannot be deleted. Edit it instead.',
      { responses },
    );
  }
}
