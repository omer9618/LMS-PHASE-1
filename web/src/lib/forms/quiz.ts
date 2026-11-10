import { z } from 'zod';

/**
 * Quiz builder forms (#68–#74). The schemas mirror the API's limits
 * (src/modules/assessment/domain/quiz.rules.ts) so mistakes are caught before a round trip; the
 * API still has the final say.
 */

export const QUIZ_LIMITS = {
  minTimeLimitMinutes: 1,
  maxTimeLimitMinutes: 24 * 60,
  maxAttempts: 100,
  minOptions: 2,
  maxOptions: 10,
  maxMarks: 100,
  maxQuestionText: 5000,
  maxOptionText: 1000,
  maxExplanation: 5000,
  maxUnit: 30,
} as const;

export const REVEAL_RULES = [
  { value: 'AFTER_ATTEMPT', label: 'After each attempt' },
  { value: 'AFTER_PASS', label: 'After passing' },
  { value: 'AFTER_FINAL_ATTEMPT', label: 'After the last attempt' },
  { value: 'NEVER', label: 'Never' },
] as const;

/** An empty box means "no limit": "" → null, otherwise a whole number in range. */
const optionalInt = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), `${what} must be a whole number`)
    .transform((v) => (v === '' ? null : Number(v)))
    .refine(
      (v) => v === null || (v >= min && v <= max),
      `${what} must be between ${min} and ${max}`,
    );

/** The settings form: text boxes in, the API's body out. */
export const quizSettingsForm = z
  .object({
    timeLimitMinutes: optionalInt(
      QUIZ_LIMITS.minTimeLimitMinutes,
      QUIZ_LIMITS.maxTimeLimitMinutes,
      'The time limit',
    ),
    maxAttempts: optionalInt(1, QUIZ_LIMITS.maxAttempts, 'Attempts'),
    passingScorePct: optionalInt(1, 100, 'The pass mark'),
    isBreakpoint: z.boolean(),
    revealAnswers: z.enum(['NEVER', 'AFTER_ATTEMPT', 'AFTER_PASS', 'AFTER_FINAL_ATTEMPT']),
  })
  .refine((v) => !v.isBreakpoint || v.passingScorePct !== null, {
    path: ['passingScorePct'],
    message: 'A checkpoint needs a pass mark',
  })
  .transform(({ timeLimitMinutes, ...rest }) => ({
    ...rest,
    timeLimitSeconds: timeLimitMinutes === null ? null : timeLimitMinutes * 60,
  }));
export type QuizSettingsInput = z.output<typeof quizSettingsForm>;

/** A decimal typed by a person: digits with an optional fraction, never a float. */
const decimal = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^-?\d{1,15}(\.\d{1,10})?$/, `${what} must be a number such as 9.86`);

const questionBase = {
  contentText: z
    .string()
    .trim()
    .min(1, 'Write the question')
    .max(QUIZ_LIMITS.maxQuestionText, 'The question is too long'),
  marks: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Marks must be a whole number')
    .transform(Number)
    .refine(
      (v) => v >= 1 && v <= QUIZ_LIMITS.maxMarks,
      `Marks must be 1 to ${QUIZ_LIMITS.maxMarks}`,
    ),
  explanation: z
    .string()
    .trim()
    .max(QUIZ_LIMITS.maxExplanation, 'The mark scheme is too long')
    .transform((v) => (v === '' ? null : v)),
};

/** The question form, by type. */
export const questionForm = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MCQ'),
    ...questionBase,
    options: z
      .array(
        z.object({
          id: z.string().optional(),
          text: z
            .string()
            .trim()
            .min(1, 'Write the option')
            .max(QUIZ_LIMITS.maxOptionText, 'The option is too long'),
          isCorrect: z.boolean(),
        }),
      )
      .min(QUIZ_LIMITS.minOptions, `Add at least ${QUIZ_LIMITS.minOptions} options`)
      .max(QUIZ_LIMITS.maxOptions, `At most ${QUIZ_LIMITS.maxOptions} options`)
      .refine((options) => options.filter((o) => o.isCorrect).length === 1, {
        message: 'Mark exactly one option as correct',
      }),
  }),
  z.object({
    type: z.literal('NUMERIC'),
    ...questionBase,
    correctAnswer: decimal('The answer'),
    tolerance: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^\d{1,12}(\.\d{1,6})?$/.test(v),
        'Tolerance must be a number such as 0.05',
      )
      .transform((v) => (v === '' ? '0' : v)),
    unit: z
      .string()
      .trim()
      .max(QUIZ_LIMITS.maxUnit, 'The unit is too long')
      .transform((v) => (v === '' ? null : v)),
  }),
]);
export type QuestionInput = z.output<typeof questionForm>;
