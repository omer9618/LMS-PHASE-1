import {
  assertCanAddQuestion,
  assertQuestionDeletable,
  assertQuizDeletable,
  DEFAULT_QUIZ_SETTINGS,
  InvalidQuizError,
  planMcqOptions,
  planNewQuestion,
  planNumericAnswer,
  planQuestionOrder,
  planQuestionUpdate,
  planQuizSettings,
  QUIZ_LIMITS,
  QuestionDraft,
  QuizLockedError,
  readOptions,
} from './quiz.rules';

function ids() {
  let n = 0;
  return () => `opt${++n}`;
}

describe('Quiz builder rules (#68–#72, #76)', () => {
  describe('planQuizSettings', () => {
    it('applies a partial change over the current settings', () => {
      expect(planQuizSettings(DEFAULT_QUIZ_SETTINGS, { timeLimitSeconds: 600 })).toEqual({
        ...DEFAULT_QUIZ_SETTINGS,
        timeLimitSeconds: 600,
      });
      const timed = { ...DEFAULT_QUIZ_SETTINGS, timeLimitSeconds: 600 };
      expect(planQuizSettings(timed, { timeLimitSeconds: null }).timeLimitSeconds).toBeNull();
    });

    it('checks ranges', () => {
      const bad = [
        { timeLimitSeconds: 29 },
        { timeLimitSeconds: 86401 },
        { maxAttempts: 0 },
        { maxAttempts: QUIZ_LIMITS.maxAttempts + 1 },
        { passingScorePct: 0 },
        { passingScorePct: 101 },
      ];
      for (const patch of bad) {
        expect(() => planQuizSettings(DEFAULT_QUIZ_SETTINGS, patch)).toThrow(InvalidQuizError);
      }
    });

    it('requires a passing score for checkpoints and AFTER_PASS, and max attempts for AFTER_FINAL_ATTEMPT', () => {
      expect(() => planQuizSettings(DEFAULT_QUIZ_SETTINGS, { isBreakpoint: true })).toThrow(
        'A checkpoint quiz needs a passing score',
      );
      expect(() =>
        planQuizSettings(DEFAULT_QUIZ_SETTINGS, { revealAnswers: 'AFTER_PASS' }),
      ).toThrow(InvalidQuizError);
      expect(() =>
        planQuizSettings(DEFAULT_QUIZ_SETTINGS, { revealAnswers: 'AFTER_FINAL_ATTEMPT' }),
      ).toThrow(InvalidQuizError);
      expect(
        planQuizSettings(DEFAULT_QUIZ_SETTINGS, { isBreakpoint: true, passingScorePct: 70 }),
      ).toMatchObject({ isBreakpoint: true, passingScorePct: 70 });
      const checkpoint = { ...DEFAULT_QUIZ_SETTINGS, isBreakpoint: true, passingScorePct: 70 };
      expect(() => planQuizSettings(checkpoint, { passingScorePct: null })).toThrow(
        InvalidQuizError,
      );
    });
  });

  describe('planMcqOptions (#69)', () => {
    it('assigns ids to new options and returns the correct option id', () => {
      const plan = planMcqOptions(
        [
          { text: '$x^2$', isCorrect: false },
          { text: '$2x$', isCorrect: true },
        ],
        [],
        ids(),
      );
      expect(plan).toEqual({
        options: [
          { id: 'opt1', text: '$x^2$' },
          { id: 'opt2', text: '$2x$' },
        ],
        correctAnswer: 'opt2',
      });
    });

    it('keeps existing ids stable and refuses unknown or repeated ids', () => {
      const plan = planMcqOptions(
        [
          { id: 'b', text: 'B', isCorrect: true },
          { text: 'new', isCorrect: false },
        ],
        ['a', 'b'],
        ids(),
      );
      expect(plan.options.map((o) => o.id)).toEqual(['b', 'opt1']);
      expect(plan.correctAnswer).toBe('b');
      expect(() =>
        planMcqOptions(
          [
            { id: 'zzz', text: 'X', isCorrect: true },
            { text: 'Y', isCorrect: false },
          ],
          ['a'],
          ids(),
        ),
      ).toThrow(InvalidQuizError);
      expect(() =>
        planMcqOptions(
          [
            { id: 'a', text: 'X', isCorrect: true },
            { id: 'a', text: 'Y', isCorrect: false },
          ],
          ['a'],
          ids(),
        ),
      ).toThrow(InvalidQuizError);
    });

    it('needs 2–10 options and exactly one correct', () => {
      expect(() => planMcqOptions([{ text: 'A', isCorrect: true }], [], ids())).toThrow(
        InvalidQuizError,
      );
      const eleven = Array.from({ length: 11 }, (_, i) => ({ text: `${i}`, isCorrect: i === 0 }));
      expect(() => planMcqOptions(eleven, [], ids())).toThrow(InvalidQuizError);
      expect(() =>
        planMcqOptions(
          [
            { text: 'A', isCorrect: false },
            { text: 'B', isCorrect: false },
          ],
          [],
          ids(),
        ),
      ).toThrow('Mark exactly one option as correct');
      expect(() =>
        planMcqOptions(
          [
            { text: 'A', isCorrect: true },
            { text: 'B', isCorrect: true },
          ],
          [],
          ids(),
        ),
      ).toThrow(InvalidQuizError);
    });

    it('reads stored options defensively', () => {
      expect(readOptions([{ id: 'a', text: 'A' }, { id: 1 }, null, 'x'])).toEqual([
        { id: 'a', text: 'A' },
      ]);
      expect(readOptions(null)).toEqual([]);
    });
  });

  describe('planNumericAnswer (#70)', () => {
    it('normalises the answer and tolerance, default tolerance 0', () => {
      expect(planNumericAnswer({ correctAnswer: '+9.810', unit: ' m/s^2 ' })).toEqual({
        correctAnswer: '9.810',
        numericTolerance: '0',
        numericUnit: 'm/s^2',
      });
      expect(planNumericAnswer({ correctAnswer: '-3', tolerance: '0.05', unit: '' })).toEqual({
        correctAnswer: '-3',
        numericTolerance: '0.05',
        numericUnit: null,
      });
    });

    it('refuses non-decimals, negative tolerances and values beyond the stored precision', () => {
      expect(() => planNumericAnswer({ correctAnswer: '1e3' })).toThrow(InvalidQuizError);
      expect(() => planNumericAnswer({ correctAnswer: '1', tolerance: '-0.1' })).toThrow(
        InvalidQuizError,
      );
      expect(() => planNumericAnswer({ correctAnswer: '1', tolerance: '0.0000001' })).toThrow(
        InvalidQuizError,
      );
      expect(() => planNumericAnswer({ correctAnswer: '1', tolerance: '1234567890123' })).toThrow(
        InvalidQuizError,
      );
      expect(() => planNumericAnswer({ correctAnswer: '0.12345678901' })).toThrow(InvalidQuizError);
      expect(planNumericAnswer({ correctAnswer: '1', tolerance: '123456789012.123456' })).toEqual(
        expect.objectContaining({ numericTolerance: '123456789012.123456' }),
      );
    });
  });

  describe('planNewQuestion / planQuestionUpdate', () => {
    const mcq: QuestionDraft = planNewQuestion(
      {
        type: 'MCQ',
        contentText: 'Derivative of $x^2$?',
        options: [
          { text: '$2x$', isCorrect: true },
          { text: '$x$', isCorrect: false },
        ],
      },
      ids(),
    );
    const numeric: QuestionDraft = planNewQuestion(
      {
        type: 'NUMERIC',
        contentText: 'g?',
        correctAnswer: '9.81',
        tolerance: '0.01',
        unit: 'm/s²',
      },
      ids(),
    );

    it('builds drafts with defaults (1 mark, no explanation)', () => {
      expect(mcq).toMatchObject({
        type: 'MCQ',
        marks: 1,
        explanation: null,
        correctAnswer: 'opt1',
      });
      expect(numeric).toMatchObject({
        type: 'NUMERIC',
        options: null,
        correctAnswer: '9.81',
        numericTolerance: '0.01',
        numericUnit: 'm/s²',
      });
    });

    it('changes only what is sent, and keeps option ids', () => {
      expect(planQuestionUpdate(mcq, { marks: 3 }, ids())).toEqual({ marks: 3 });
      const change = planQuestionUpdate(
        mcq,
        {
          options: [
            { id: 'opt1', text: '$2x$', isCorrect: false },
            { id: 'opt2', text: '$x$', isCorrect: true },
          ],
        },
        ids(),
      );
      expect(change).toEqual({
        options: [
          { id: 'opt1', text: '$2x$' },
          { id: 'opt2', text: '$x$' },
        ],
        correctAnswer: 'opt2',
      });
    });

    it('recomputes numeric fields from current values when one changes', () => {
      expect(planQuestionUpdate(numeric, { tolerance: '0.1' }, ids())).toEqual({
        correctAnswer: '9.81',
        numericTolerance: '0.1',
        numericUnit: 'm/s²',
      });
      expect(planQuestionUpdate(numeric, { unit: null }, ids())).toMatchObject({
        numericUnit: null,
      });
    });

    it('refuses fields of the other question type', () => {
      expect(() => planQuestionUpdate(mcq, { correctAnswer: '1' }, ids())).toThrow(
        InvalidQuizError,
      );
      expect(() =>
        planQuestionUpdate(numeric, { options: [{ text: 'a', isCorrect: true }] }, ids()),
      ).toThrow(InvalidQuizError);
    });
  });

  describe('ordering and deletion', () => {
    it('accepts a full reorder only', () => {
      expect(planQuestionOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
      expect(() => planQuestionOrder(['a', 'b'], ['a'])).toThrow(InvalidQuizError);
      expect(() => planQuestionOrder(['a', 'b'], ['a', 'a'])).toThrow(InvalidQuizError);
      expect(() => planQuestionOrder(['a', 'b'], ['a', 'x'])).toThrow(InvalidQuizError);
    });

    it('caps the question count', () => {
      expect(() => assertCanAddQuestion(QUIZ_LIMITS.maxQuestions - 1)).not.toThrow();
      expect(() => assertCanAddQuestion(QUIZ_LIMITS.maxQuestions)).toThrow(InvalidQuizError);
    });

    it('never deletes student work', () => {
      expect(() => assertQuizDeletable(0)).not.toThrow();
      expect(() => assertQuizDeletable(1)).toThrow(QuizLockedError);
      expect(() => assertQuestionDeletable(0)).not.toThrow();
      expect(() => assertQuestionDeletable(2)).toThrow(QuizLockedError);
    });
  });
});
