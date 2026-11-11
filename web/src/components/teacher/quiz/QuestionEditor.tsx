'use client';

import { useState, type FormEvent } from 'react';
import { MathText } from '@/components/learn/MathText';
import { Badge, Button, Input, Section, Select, Textarea } from '@/components/ui';
import { type QuestionType, type QuizQuestion } from '@/lib/api/quiz-builder';
import { questionForm, QUIZ_LIMITS, type QuestionInput } from '@/lib/forms/quiz';
import { validateForm, type FieldErrors } from '@/lib/forms/validate';
import { ConfirmButton } from '@/components/ui';
import styles from './QuizBuilder.module.css';

interface OptionValue {
  id?: string;
  text: string;
  isCorrect: boolean;
}

interface Values {
  type: QuestionType;
  contentText: string;
  marks: string;
  explanation: string;
  options: OptionValue[];
  correctAnswer: string;
  tolerance: string;
  unit: string;
}

const BLANK_OPTIONS: OptionValue[] = [
  { text: '', isCorrect: true },
  { text: '', isCorrect: false },
];

function initial(question: QuizQuestion | null): Values {
  return {
    type: question?.type ?? 'MCQ',
    contentText: question?.contentText ?? '',
    marks: String(question?.marks ?? 1),
    explanation: question?.explanation ?? '',
    options: question?.options?.map((o) => ({ ...o })) ?? BLANK_OPTIONS,
    correctAnswer: question?.type === 'NUMERIC' ? question.correctAnswer : '',
    tolerance: question?.numericTolerance ?? '',
    unit: question?.numericUnit ?? '',
  };
}

/** One question: the form on the left, what the student will see on the right. */
export function QuestionEditor({
  question,
  number,
  readOnly = false,
  onSave,
  onDelete,
}: {
  /** null for a new question. */
  question: QuizQuestion | null;
  number: number;
  readOnly?: boolean;
  /** Resolves true when saved. */
  onSave: (input: QuestionInput) => Promise<boolean>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<Values>(() => initial(question));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setOption = (index: number, change: Partial<OptionValue>) =>
    set(
      'options',
      values.options.map((o, i) => (i === index ? { ...o, ...change } : o)),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateForm(questionForm, values);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    setSaving(true);
    await onSave(result.data);
    setSaving(false);
  }

  const mcq = values.type === 'MCQ';

  return (
    <Section
      raised
      flush
      title={question ? `Question ${number}` : `New question (${number})`}
      actions={
        question ? (
          <Badge>{mcq ? 'Multiple choice' : 'Numeric'}</Badge>
        ) : (
          <Select
            label="Type"
            value={values.type}
            disabled={readOnly}
            onChange={(e) => set('type', e.target.value as QuestionType)}
          >
            <option value="MCQ">Multiple choice</option>
            <option value="NUMERIC">Numeric</option>
          </Select>
        )
      }
    >
      <div className={styles.editor}>
        <form noValidate onSubmit={submit} className={styles.form} aria-label="Question">
          <Textarea
            label="Question text"
            hint="LaTeX between $ signs, for example $T = 2\pi\sqrt{l/g}$"
            rows={4}
            maxLength={QUIZ_LIMITS.maxQuestionText}
            value={values.contentText}
            error={errors.contentText}
            disabled={readOnly}
            onChange={(e) => set('contentText', e.target.value)}
          />

          {mcq ? (
            <fieldset className={styles.options}>
              <legend>Options (choose the correct one)</legend>
              {values.options.map((option, index) => (
                <div key={index} className={styles.option}>
                  <input
                    type="radio"
                    name="correct-option"
                    aria-label={`Option ${index + 1} is correct`}
                    checked={option.isCorrect}
                    disabled={readOnly}
                    onChange={() =>
                      set(
                        'options',
                        values.options.map((o, i) => ({ ...o, isCorrect: i === index })),
                      )
                    }
                  />
                  <Input
                    label={`Option ${index + 1}`}
                    value={option.text}
                    error={errors[`options.${index}.text`]}
                    disabled={readOnly}
                    onChange={(e) => setOption(index, { text: e.target.value })}
                  />
                  {!readOnly && values.options.length > QUIZ_LIMITS.minOptions && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() =>
                        set(
                          'options',
                          values.options.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {errors.options && <p className={styles.error}>{errors.options}</p>}
              {!readOnly && values.options.length < QUIZ_LIMITS.maxOptions && (
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      set('options', [...values.options, { text: '', isCorrect: false }])
                    }
                  >
                    Add an option
                  </Button>
                </div>
              )}
            </fieldset>
          ) : (
            <div className={styles.numeric}>
              <Input
                label="Correct answer"
                inputMode="decimal"
                value={values.correctAnswer}
                error={errors.correctAnswer}
                disabled={readOnly}
                onChange={(e) => set('correctAnswer', e.target.value)}
              />
              <Input
                label="Tolerance ±"
                hint="Empty for an exact match"
                inputMode="decimal"
                value={values.tolerance}
                error={errors.tolerance}
                disabled={readOnly}
                onChange={(e) => set('tolerance', e.target.value)}
              />
              <Input
                label="Unit"
                hint="Shown beside the answer box"
                maxLength={QUIZ_LIMITS.maxUnit}
                value={values.unit}
                error={errors.unit}
                disabled={readOnly}
                onChange={(e) => set('unit', e.target.value)}
              />
            </div>
          )}

          <div className={styles.numeric}>
            <Input
              label="Marks"
              inputMode="numeric"
              value={values.marks}
              error={errors.marks}
              disabled={readOnly}
              onChange={(e) => set('marks', e.target.value)}
            />
          </div>
          <Textarea
            label="Mark scheme"
            hint="Shown to students when the quiz’s rule reveals answers"
            rows={3}
            maxLength={QUIZ_LIMITS.maxExplanation}
            value={values.explanation}
            error={errors.explanation}
            disabled={readOnly}
            onChange={(e) => set('explanation', e.target.value)}
          />

          {!readOnly && (
            <div className={styles.actions}>
              <Button type="submit" loading={saving} loadingText="Saving…">
                {question ? 'Save question' : 'Add question'}
              </Button>
              {onDelete && (
                <ConfirmButton
                  question="Delete this question? This cannot be undone."
                  confirmLabel="Delete question"
                  onConfirm={onDelete}
                >
                  Delete…
                </ConfirmButton>
              )}
            </div>
          )}
        </form>

        <aside className={styles.preview} aria-label="Student preview">
          <p className="eyebrow">Student preview</p>
          <div className={styles.paper}>
            <div className={styles.paperHead}>
              <span className="mono">Q{number}</span>
              <Badge tone="primary">
                [{values.marks || '?'} mark{values.marks === '1' ? '' : 's'}]
              </Badge>
            </div>
            <div className={styles.questionText}>
              {values.contentText.trim() ? (
                <MathText text={values.contentText} block />
              ) : (
                <span className="muted">The question appears here as you type.</span>
              )}
            </div>
            {mcq ? (
              <ul className={styles.previewOptions}>
                {values.options.map((option, index) => (
                  <li key={index} data-correct={option.isCorrect || undefined}>
                    <span className="mono">{String.fromCharCode(65 + index)}</span>
                    <MathText text={option.text || '…'} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.answerBox}>
                <span className="muted">Your answer</span>
                <span className="mono">{values.unit}</span>
              </p>
            )}
          </div>
          {!mcq && values.correctAnswer && (
            <p className="hint">
              Accepts <span className="mono">{values.correctAnswer}</span>
              {values.tolerance && values.tolerance !== '0' && (
                <>
                  {' '}
                  ± <span className="mono">{values.tolerance}</span>
                </>
              )}{' '}
              {values.unit}
            </p>
          )}
        </aside>
      </div>
    </Section>
  );
}
