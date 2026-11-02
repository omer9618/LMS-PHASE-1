import {
  acceptsAnswers,
  AttemptRefusedError,
  attemptDeadline,
  attemptsRemaining,
  canRevealAnswers,
  DEADLINE_GRACE_SECONDS,
  decideStartAttempt,
  GradableQuestion,
  gradeAttempt,
  InvalidAnswerError,
  isAnswerCorrect,
  normaliseAnswer,
  RevealFacts,
} from './attempt.rules';
import type { RevealValue } from './quiz.rules';

const mcq: GradableQuestion = {
  id: 'q1',
  type: 'MCQ',
  optionIds: ['a', 'b', 'c'],
  correctAnswer: 'b',
  numericTolerance: null,
  marks: 2,
};
const numeric: GradableQuestion = {
  id: 'q2',
  type: 'NUMERIC',
  optionIds: [],
  correctAnswer: '9.81',
  numericTolerance: '0.05',
  marks: 1,
};
const exact: GradableQuestion = {
  ...numeric,
  id: 'q3',
  correctAnswer: '0.3',
  numericTolerance: '0',
};

describe('Attempt rules (#73, #74, #76)', () => {
  describe('deadline (#73)', () => {
    const started = new Date('2026-11-02T10:00:00.000Z');
    const at = (ms: number) => new Date(started.getTime() + ms);

    it('is started_at + time limit, or none when untimed', () => {
      expect(attemptDeadline(started, 600)).toEqual(at(600_000));
      expect(attemptDeadline(started, null)).toBeNull();
    });

    it('accepts answers up to deadline + grace, inclusive, and not a millisecond later', () => {
      const grace = DEADLINE_GRACE_SECONDS * 1000;
      expect(acceptsAnswers(started, 600, at(600_000))).toBe(true);
      expect(acceptsAnswers(started, 600, at(600_000 + grace))).toBe(true);
      expect(acceptsAnswers(started, 600, at(600_000 + grace + 1))).toBe(false);
      expect(acceptsAnswers(started, null, at(10 * 365 * 86_400_000))).toBe(true);
    });
  });

  describe('starting (#74)', () => {
    const base = { maxAttempts: 2, questionCount: 3, attemptNumbers: [], openAttemptId: null };

    it('starts at 1 and numbers sequentially', () => {
      expect(decideStartAttempt(base)).toEqual({ kind: 'START', attemptNumber: 1 });
      expect(decideStartAttempt({ ...base, attemptNumbers: [1] })).toEqual({
        kind: 'START',
        attemptNumber: 2,
      });
    });

    it('resumes an attempt in progress instead of starting another', () => {
      expect(decideStartAttempt({ ...base, attemptNumbers: [1, 2], openAttemptId: 'x' })).toEqual({
        kind: 'RESUME',
        attemptId: 'x',
      });
    });

    it('enforces max attempts, counting every attempt started', () => {
      expect(() => decideStartAttempt({ ...base, attemptNumbers: [1, 2] })).toThrow(
        AttemptRefusedError,
      );
      expect(decideStartAttempt({ ...base, maxAttempts: null, attemptNumbers: [1, 2, 3] })).toEqual(
        { kind: 'START', attemptNumber: 4 },
      );
    });

    it('refuses a quiz without questions', () => {
      expect(() => decideStartAttempt({ ...base, questionCount: 0 })).toThrow(
        'This quiz has no questions yet',
      );
    });

    it('reports remaining attempts', () => {
      expect(attemptsRemaining(3, 1)).toBe(2);
      expect(attemptsRemaining(3, 5)).toBe(0);
      expect(attemptsRemaining(null, 5)).toBeNull();
    });
  });

  describe('answers and grading (#69, #70)', () => {
    it('accepts only option ids for MCQ and plain decimals for numeric', () => {
      expect(normaliseAnswer(mcq, ' b ')).toBe('b');
      expect(() => normaliseAnswer(mcq, 'z')).toThrow(InvalidAnswerError);
      expect(normaliseAnswer(numeric, '9.8')).toBe('9.8');
      expect(() => normaliseAnswer(numeric, '9.8 m/s')).toThrow(InvalidAnswerError);
      expect(() => normaliseAnswer(numeric, '1e1')).toThrow(InvalidAnswerError);
    });

    it('grades MCQ by option id', () => {
      expect(isAnswerCorrect(mcq, 'b')).toBe(true);
      expect(isAnswerCorrect(mcq, 'a')).toBe(false);
      expect(isAnswerCorrect(mcq, null)).toBe(false);
    });

    it('grades numeric answers exactly within the tolerance, edges inclusive', () => {
      expect(isAnswerCorrect(numeric, '9.81')).toBe(true);
      expect(isAnswerCorrect(numeric, '9.76')).toBe(true);
      expect(isAnswerCorrect(numeric, '9.86')).toBe(true);
      expect(isAnswerCorrect(numeric, '9.860')).toBe(true);
      expect(isAnswerCorrect(numeric, '9.7599')).toBe(false);
      expect(isAnswerCorrect(numeric, '9.8601')).toBe(false);
      expect(isAnswerCorrect(exact, '0.30')).toBe(true);
      expect(isAnswerCorrect(exact, '.3')).toBe(true);
      expect(isAnswerCorrect(exact, '0.30000000000000004')).toBe(false);
      expect(isAnswerCorrect(numeric, 'abc')).toBe(false);
    });

    it('records every question, scores rounded down, and passes on the exact ratio', () => {
      const grade = gradeAttempt(
        [mcq, numeric, exact],
        new Map([
          ['q1', 'b'],
          ['q2', '1'],
        ]),
        50,
      );
      expect(grade.responses).toEqual([
        { questionId: 'q1', studentAnswer: 'b', isCorrect: true, marksAwarded: 2 },
        { questionId: 'q2', studentAnswer: '1', isCorrect: false, marksAwarded: 0 },
        { questionId: 'q3', studentAnswer: null, isCorrect: false, marksAwarded: 0 },
      ]);
      expect(grade).toMatchObject({ marksAwarded: 2, totalMarks: 4, scorePct: 50, isPassed: true });

      // 2 of 3 marks = 66.66…%: scorePct 66; a 67% pass mark is not met.
      const twoThirds = gradeAttempt(
        [
          { ...numeric, id: 'a' },
          { ...numeric, id: 'b' },
          { ...numeric, id: 'c' },
        ],
        new Map([
          ['a', '9.81'],
          ['b', '9.81'],
        ]),
        67,
      );
      expect(twoThirds.scorePct).toBe(66);
      expect(twoThirds.isPassed).toBe(false);
      expect(gradeAttempt([mcq], new Map(), null).isPassed).toBeNull();
      expect(gradeAttempt([], new Map(), 50)).toMatchObject({ scorePct: 0, isPassed: false });
    });
  });

  describe('reveal matrix (#76)', () => {
    const closed: Omit<RevealFacts, 'reveal'> = {
      attemptClosed: true,
      hasPassed: false,
      maxAttempts: 2,
      attemptsUsed: 1,
      hasOpenAttempt: false,
    };
    const reveal = (r: RevealValue, facts: Partial<RevealFacts> = {}) =>
      canRevealAnswers({ ...closed, reveal: r, ...facts });

    it('never reveals on an open attempt', () => {
      for (const r of ['NEVER', 'AFTER_ATTEMPT', 'AFTER_PASS', 'AFTER_FINAL_ATTEMPT'] as const) {
        expect(
          reveal(r, {
            attemptClosed: false,
            hasPassed: true,
            attemptsUsed: 2,
            hasOpenAttempt: true,
          }),
        ).toBe(false);
      }
    });

    it('NEVER', () => {
      expect(reveal('NEVER', { hasPassed: true, attemptsUsed: 2 })).toBe(false);
    });

    it('AFTER_ATTEMPT', () => {
      expect(reveal('AFTER_ATTEMPT')).toBe(true);
    });

    it('AFTER_PASS', () => {
      expect(reveal('AFTER_PASS')).toBe(false);
      expect(reveal('AFTER_PASS', { hasPassed: true })).toBe(true);
    });

    it('AFTER_FINAL_ATTEMPT', () => {
      expect(reveal('AFTER_FINAL_ATTEMPT')).toBe(false);
      expect(reveal('AFTER_FINAL_ATTEMPT', { hasPassed: true })).toBe(false);
      expect(reveal('AFTER_FINAL_ATTEMPT', { attemptsUsed: 2 })).toBe(true);
      expect(reveal('AFTER_FINAL_ATTEMPT', { attemptsUsed: 2, hasOpenAttempt: true })).toBe(false);
      expect(reveal('AFTER_FINAL_ATTEMPT', { maxAttempts: null, attemptsUsed: 50 })).toBe(false);
    });
  });
});
