import { RevealAnswers } from '@prisma/client';
import { z } from 'zod';
import { QUIZ_LIMITS } from '../domain/quiz.rules';

export const quizParamsSchema = z.object({ courseId: z.uuid(), lessonId: z.uuid() });
export type QuizParams = z.infer<typeof quizParamsSchema>;

export const questionParamsSchema = z.object({
  courseId: z.uuid(),
  lessonId: z.uuid(),
  questionId: z.uuid(),
});
export type QuestionParams = z.infer<typeof questionParamsSchema>;

/** Settings (#68, #73, #74, #76). Cross-field rules (checkpoint needs a passing score) are in quiz.rules. */
const settingsShape = {
  timeLimitSeconds: z.int().nullable().optional(),
  maxAttempts: z.int().nullable().optional(),
  isBreakpoint: z.boolean().optional(),
  passingScorePct: z.int().nullable().optional(),
  revealAnswers: z.enum(RevealAnswers).optional(),
};

export const createQuizSchema = z.strictObject(settingsShape).default({});
export type CreateQuizInput = z.infer<typeof createQuizSchema>;

export const updateQuizSchema = z
  .strictObject(settingsShape)
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;

/**
 * Text may contain LaTeX between `$...$` / `$$...$$` (#71). It is stored as written; only its
 * length is checked. Rendering is the web app's job.
 */
const questionText = z.string().trim().min(1).max(QUIZ_LIMITS.maxQuestionText);
const explanation = z.string().trim().max(QUIZ_LIMITS.maxExplanation).nullable();
const marks = z.int().min(1).max(QUIZ_LIMITS.maxMarks);
/** Decimal strings, never JSON numbers (no float on the way in). Shape is checked in quiz.rules. */
const decimalString = z.string().trim().min(1).max(40);
const unit = z.string().trim().max(QUIZ_LIMITS.maxUnit).nullable();

const optionSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,36}$/)
    .optional(),
  text: z.string().trim().min(1).max(QUIZ_LIMITS.maxOptionText),
  isCorrect: z.boolean(),
});
const options = z.array(optionSchema).max(QUIZ_LIMITS.maxOptions);

export const createQuestionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('MCQ'),
    contentText: questionText,
    options,
    marks: marks.optional(),
    explanation: explanation.optional(),
  }),
  z.strictObject({
    type: z.literal('NUMERIC'),
    contentText: questionText,
    correctAnswer: decimalString,
    tolerance: decimalString.optional(),
    unit: unit.optional(),
    marks: marks.optional(),
    explanation: explanation.optional(),
  }),
]);
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** The type never changes; MCQ takes `options`, NUMERIC takes `correctAnswer`/`tolerance`/`unit`. */
export const updateQuestionSchema = z
  .strictObject({
    contentText: questionText.optional(),
    explanation: explanation.optional(),
    marks: marks.optional(),
    options: options.optional(),
    correctAnswer: decimalString.optional(),
    tolerance: decimalString.optional(),
    unit: unit.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to change');
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const questionOrderSchema = z.strictObject({
  questionIds: z.array(z.uuid()).max(QUIZ_LIMITS.maxQuestions),
});
export type QuestionOrderInput = z.infer<typeof questionOrderSchema>;
