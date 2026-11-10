import { z } from 'zod';
import { QUIZ_LIMITS } from '../domain/quiz.rules';
import { uuidParams } from '../../../common/schemas';

export const attemptParamsSchema = uuidParams('courseId', 'lessonId', 'attemptId');
export type AttemptParams = z.infer<typeof attemptParamsSchema>;

/**
 * MCQ: the chosen option id. NUMERIC: a decimal string ("9.81"); never a JSON number, so no float
 * conversion happens on the way in. `null` clears a saved answer.
 */
const answersShape = z
  .array(
    z.strictObject({
      questionId: z.uuid(),
      answer: z.string().max(40).nullable(),
    }),
  )
  .max(QUIZ_LIMITS.maxQuestions);

export const saveAnswersSchema = z.strictObject({ answers: answersShape });
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const submitAttemptSchema = z.strictObject({ answers: answersShape.optional() }).default({});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
