import { describe, expect, it } from 'vitest';
import { validateForm } from '@/lib/zod-form';
import { questionForm, quizSettingsForm } from './quiz-builder';

const settings = {
  timeLimitMinutes: '20',
  maxAttempts: '3',
  passingScorePct: '60',
  isBreakpoint: true,
  revealAnswers: 'AFTER_FINAL_ATTEMPT',
};

describe('quiz settings form', () => {
  it('turns text boxes into the API body: minutes to seconds, empty to no limit', () => {
    const filled = validateForm(quizSettingsForm, settings);
    expect(filled).toEqual({
      ok: true,
      data: {
        timeLimitSeconds: 1200,
        maxAttempts: 3,
        passingScorePct: 60,
        isBreakpoint: true,
        revealAnswers: 'AFTER_FINAL_ATTEMPT',
      },
    });
    const open = validateForm(quizSettingsForm, {
      ...settings,
      timeLimitMinutes: '',
      maxAttempts: '',
      passingScorePct: '',
      isBreakpoint: false,
    });
    expect(open.ok && open.data).toMatchObject({
      timeLimitSeconds: null,
      maxAttempts: null,
      passingScorePct: null,
    });
  });

  it('requires a pass mark for a checkpoint and names the field', () => {
    const result = validateForm(quizSettingsForm, { ...settings, passingScorePct: '' });
    expect(result).toEqual({
      ok: false,
      errors: { passingScorePct: 'A checkpoint needs a pass mark' },
    });
  });

  it('rejects text and out-of-range numbers', () => {
    const result = validateForm(quizSettingsForm, {
      ...settings,
      timeLimitMinutes: 'ten',
      maxAttempts: '500',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'maxAttempts',
      'timeLimitMinutes',
    ]);
  });
});

describe('question form', () => {
  const numeric = {
    type: 'NUMERIC',
    contentText: ' Calculate $g$. ',
    marks: '3',
    explanation: '',
    correctAnswer: '9.86',
    tolerance: '',
    unit: 'm/s²',
  };

  it('keeps numeric answers as decimal strings, never floats', () => {
    const result = validateForm(questionForm, numeric);
    expect(result).toEqual({
      ok: true,
      data: {
        type: 'NUMERIC',
        contentText: 'Calculate $g$.',
        marks: 3,
        explanation: null,
        correctAnswer: '9.86',
        tolerance: '0',
        unit: 'm/s²',
      },
    });
  });

  it('refuses an answer that is not a plain decimal', () => {
    const result = validateForm(questionForm, { ...numeric, correctAnswer: '9,86' });
    expect(!result.ok && result.errors.correctAnswer).toMatch(/must be a number/);
  });

  it('needs exactly one correct option, and text in each', () => {
    const base = { type: 'MCQ', contentText: 'Pick one', marks: '1', explanation: '' };
    const none = validateForm(questionForm, {
      ...base,
      options: [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: false },
      ],
    });
    expect(!none.ok && none.errors.options).toBe('Mark exactly one option as correct');

    const blank = validateForm(questionForm, {
      ...base,
      options: [
        { text: 'A', isCorrect: true },
        { text: ' ', isCorrect: false },
      ],
    });
    expect(!blank.ok && blank.errors['options.1.text']).toBe('Write the option');

    const good = validateForm(questionForm, {
      ...base,
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
      ],
    });
    expect(good.ok).toBe(true);
  });
});
