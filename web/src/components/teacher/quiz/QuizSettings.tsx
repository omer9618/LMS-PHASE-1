'use client';

import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Select } from '@/components/ui';
import { type TeacherQuiz } from '@/lib/api/quiz-builder';
import { quizSettingsForm, REVEAL_RULES, type QuizSettingsInput } from '@/lib/forms/quiz';
import { validateForm, type FieldErrors } from '@/lib/zod-form';
import styles from './QuizBuilder.module.css';

interface Values {
  timeLimitMinutes: string;
  maxAttempts: string;
  passingScorePct: string;
  isBreakpoint: boolean;
  revealAnswers: string;
}

const text = (value: number | null) => (value === null ? '' : String(value));

function initial(quiz: TeacherQuiz | null): Values {
  return {
    timeLimitMinutes:
      quiz?.timeLimitSeconds == null ? '' : String(Math.round(quiz.timeLimitSeconds / 60)),
    maxAttempts: text(quiz?.maxAttempts ?? null),
    passingScorePct: text(quiz?.passingScorePct ?? null),
    isBreakpoint: quiz?.isBreakpoint ?? false,
    revealAnswers: quiz?.revealAnswers ?? 'AFTER_ATTEMPT',
  };
}

/** The quiz rules (#68, #73, #74, #76): time, attempts, pass mark, checkpoint, answer reveal. */
export function QuizSettings({
  quiz,
  submitLabel,
  readOnly = false,
  onSave,
}: {
  quiz: TeacherQuiz | null;
  submitLabel: string;
  readOnly?: boolean;
  /** Resolves true when saved. */
  onSave: (settings: QuizSettingsInput) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Values>(() => initial(quiz));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateForm(quizSettingsForm, values);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    setSaving(true);
    await onSave(result.data);
    setSaving(false);
  }

  return (
    <form noValidate onSubmit={submit} className={styles.settings} aria-label="Quiz rules">
      <Input
        label="Time limit (minutes)"
        hint="Empty for no limit"
        inputMode="numeric"
        value={values.timeLimitMinutes}
        error={errors.timeLimitMinutes}
        disabled={readOnly}
        onChange={(e) => set('timeLimitMinutes', e.target.value)}
      />
      <Input
        label="Attempts allowed"
        hint="Empty for unlimited"
        inputMode="numeric"
        value={values.maxAttempts}
        error={errors.maxAttempts}
        disabled={readOnly}
        onChange={(e) => set('maxAttempts', e.target.value)}
      />
      <Input
        label="Pass mark (%)"
        hint="Needed for a checkpoint"
        inputMode="numeric"
        value={values.passingScorePct}
        error={errors.passingScorePct}
        disabled={readOnly}
        onChange={(e) => set('passingScorePct', e.target.value)}
      />
      <Select
        label="Show the mark scheme"
        value={values.revealAnswers}
        disabled={readOnly}
        onChange={(e) => set('revealAnswers', e.target.value)}
      >
        {REVEAL_RULES.map((rule) => (
          <option key={rule.value} value={rule.value}>
            {rule.label}
          </option>
        ))}
      </Select>
      <div className={styles.settingsWide}>
        <Checkbox
          label="Checkpoint: later lessons stay locked until this quiz is passed"
          checked={values.isBreakpoint}
          disabled={readOnly}
          onChange={(e) => set('isBreakpoint', e.target.checked)}
        />
      </div>
      {!readOnly && (
        <div className={styles.settingsWide}>
          <Button type="submit" size="sm" loading={saving} loadingText="Saving…">
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
