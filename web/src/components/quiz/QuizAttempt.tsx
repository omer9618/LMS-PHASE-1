'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { MathText } from '@/components/learn/MathText';
import { errorMessage, isRequestError } from '@/lib/api/errors';
import type { AnswerInput, AttemptQuestion, AttemptView, LearnApi } from '@/lib/api/learn';
import { isPlainDecimal } from '@/lib/quiz/answers';
import { QuizTimer } from './QuizTimer';
import styles from './Quiz.module.css';

export interface QuizAttemptProps {
  courseId: string;
  lessonId: string;
  attempt: AttemptView;
  timeLimitSeconds: number | null;
  client: LearnApi;
  onClosed: (attempt: AttemptView) => void;
  /** Leave the attempt without submitting; the timer keeps running and it can be resumed. */
  onExit?: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Typing in a numeric answer saves after this pause; choosing an option saves at once. */
const NUMERIC_SAVE_DELAY_MS = 800;

/**
 * An attempt in progress (#75): one question at a time with a question navigator, answers saved
 * as they are given, a server-time countdown, and submission. When time runs out the API has
 * already closed the attempt; we fetch it and show the result.
 */
export function QuizAttempt({
  courseId,
  lessonId,
  attempt,
  timeLimitSeconds,
  client,
  onClosed,
  onExit,
}: QuizAttemptProps) {
  const questions = attempt.questions;
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.yourAnswer ?? ''])),
  );
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(new Map<string, string | null>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  const finish = useCallback(
    async (send: AnswerInput[] | null) => {
      if (finished.current) return;
      finished.current = true;
      setSubmitting(true);
      try {
        const result = send
          ? await client.submitAttempt(courseId, lessonId, attempt.id, send)
          : await client.getAttempt(courseId, lessonId, attempt.id);
        onClosed(result);
      } catch (e) {
        finished.current = false;
        setError(errorMessage(e));
        setSubmitting(false);
      }
    },
    [client, courseId, lessonId, attempt.id, onClosed],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current.size === 0) return;
    const batch = [...pending.current].map(([questionId, answer]) => ({ questionId, answer }));
    pending.current.clear();
    setSaveState('saving');
    try {
      await client.saveAnswers(courseId, lessonId, attempt.id, batch);
      setSaveState('saved');
      setError(null);
    } catch (e) {
      if (isRequestError(e, 'QUIZ_ATTEMPT_CLOSED')) {
        await finish(null);
        return;
      }
      for (const { questionId, answer } of batch) {
        if (!pending.current.has(questionId)) pending.current.set(questionId, answer);
      }
      setSaveState('error');
      setError(errorMessage(e));
    }
  }, [client, courseId, lessonId, attempt.id, finish]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function answer(question: AttemptQuestion, value: string) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    const trimmed = value.trim();
    if (question.type === 'NUMERIC' && trimmed !== '' && !isPlainDecimal(trimmed)) return;
    pending.current.set(question.id, trimmed === '' ? null : trimmed);
    if (timer.current) clearTimeout(timer.current);
    if (question.type === 'MCQ') void flush();
    else timer.current = setTimeout(() => void flush(), NUMERIC_SAVE_DELAY_MS);
  }

  async function submit() {
    if (timer.current) clearTimeout(timer.current);
    const final = questions
      .map((q) => ({ questionId: q.id, answer: answers[q.id]?.trim() ?? '' }))
      .filter((a) => {
        const q = questions.find((x) => x.id === a.questionId);
        return q?.type !== 'NUMERIC' || a.answer === '' || isPlainDecimal(a.answer);
      })
      .map((a) => ({ questionId: a.questionId, answer: a.answer === '' ? null : a.answer }));
    pending.current.clear();
    await finish(final);
  }

  const question = questions[index];
  const unanswered = questions.filter((q) => !answers[q.id]?.trim()).length;
  const invalidNumeric = questions.filter(
    (q) => q.type === 'NUMERIC' && answers[q.id]?.trim() && !isPlainDecimal(answers[q.id] ?? ''),
  );

  return (
    <section className={styles.panel} aria-labelledby="attempt-heading">
      <div className={styles.attemptBar}>
        <h2 id="attempt-heading">Attempt {attempt.attemptNumber}</h2>
        <QuizTimer
          deadline={attempt.deadline}
          serverTime={attempt.serverTime}
          timeLimitSeconds={timeLimitSeconds}
          // Time is up: submit what is on screen. The API still takes it within its short grace
          // period, and grades only what was saved in time after that.
          onExpired={() => void submit()}
        />
        <span className={styles.saveState} role="status" aria-live="polite">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All answers saved'}
          {saveState === 'error' && 'Not saved yet'}
        </span>
        <div className={styles.barActions}>
          {onExit && (
            <Button variant="ghost" size="sm" onClick={onExit} disabled={submitting}>
              Leave for now
            </Button>
          )}
          <Button size="sm" onClick={() => setConfirming(true)} disabled={submitting}>
            Submit attempt
          </Button>
        </div>
      </div>

      {confirming && (
        <div className={styles.confirm} role="group" aria-labelledby="confirm-heading">
          <h3 id="confirm-heading">Submit your answers?</h3>
          {unanswered > 0 ? (
            <p>
              {unanswered} of {questions.length} question{questions.length === 1 ? '' : 's'}{' '}
              {unanswered === 1 ? 'is' : 'are'} not answered. Unanswered questions score zero.
            </p>
          ) : (
            <p>
              {questions.length === 1
                ? 'The question is answered.'
                : `All ${questions.length} questions are answered.`}
            </p>
          )}
          {invalidNumeric.length > 0 && (
            <p>
              {invalidNumeric.length} numeric answer{invalidNumeric.length > 1 ? 's are' : ' is'}{' '}
              not a plain number and will not be sent.
            </p>
          )}
          <div className={styles.stepper}>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep working
            </Button>
            <Button onClick={submit} loading={submitting} loadingText="Submitting…">
              Submit
            </Button>
          </div>
        </div>
      )}
      <nav aria-label="Questions" className={styles.navigator}>
        <ol>
          {questions.map((q, i) => {
            const answered = Boolean(answers[q.id]?.trim());
            return (
              <li key={q.id}>
                <button
                  type="button"
                  className={styles.navButton}
                  data-current={i === index || undefined}
                  data-answered={answered || undefined}
                  aria-current={i === index ? 'step' : undefined}
                  aria-label={`Question ${i + 1}${answered ? ', answered' : ', not answered'}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <p className={styles.legend}>
        Blue: this question. Tinted: answered. White: not answered yet.
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      {question && (
        <QuestionCard
          key={question.id}
          number={index + 1}
          total={questions.length}
          question={question}
          value={answers[question.id] ?? ''}
          onChange={(value) => answer(question, value)}
          onBlur={() => void flush()}
          disabled={submitting}
        />
      )}

      <div className={styles.stepper}>
        <Button
          variant="secondary"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          Previous
        </Button>
        {index < questions.length - 1 ? (
          <Button variant="secondary" onClick={() => setIndex((i) => i + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={() => setConfirming(true)} disabled={submitting}>
            Review and submit
          </Button>
        )}
      </div>
    </section>
  );
}

interface QuestionCardProps {
  number: number;
  total: number;
  question: AttemptQuestion;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
}

function QuestionCard({
  number,
  total,
  question,
  value,
  onChange,
  onBlur,
  disabled,
}: QuestionCardProps) {
  const headingId = `question-${question.id}`;
  const hintId = `${headingId}-hint`;
  const invalid = question.type === 'NUMERIC' && value.trim() !== '' && !isPlainDecimal(value);
  return (
    <fieldset className={styles.question} aria-labelledby={headingId} disabled={disabled}>
      <legend id={headingId} className={styles.questionLegend}>
        <span className={styles.questionNumber}>
          Question {number} of {total} · {question.marks} mark{question.marks === 1 ? '' : 's'}
        </span>
        <MathText text={question.contentText} block />
      </legend>
      {question.imageUrl && (
        // Signed, short-lived storage URL: next/image would cache it past its expiry.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.questionImage}
          src={question.imageUrl}
          alt="Diagram for this question"
        />
      )}

      {question.type === 'MCQ' && question.options ? (
        <div className={styles.options}>
          {question.options.map((option) => (
            <label key={option.id} className={styles.option}>
              <input
                type="radio"
                name={`answer-${question.id}`}
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
              />
              <MathText text={option.text} />
            </label>
          ))}
        </div>
      ) : (
        <div className={styles.numeric}>
          <label htmlFor={`${headingId}-input`} className="visually-hidden">
            Your answer
          </label>
          <input
            id={`${headingId}-input`}
            className={styles.numericInput}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            aria-describedby={hintId}
            aria-invalid={invalid || undefined}
          />
          {question.numericUnit && <span className={styles.unit}>{question.numericUnit}</span>}
          <p id={hintId} className={invalid ? styles.fieldError : styles.muted}>
            {invalid
              ? 'Enter a plain number, such as 9.81 or -0.5 (no units, commas or exponents).'
              : question.numericUnit
                ? 'Type the number only. The unit is fixed.'
                : 'Type a number, such as 9.81 or -0.5.'}
          </p>
        </div>
      )}
    </fieldset>
  );
}
