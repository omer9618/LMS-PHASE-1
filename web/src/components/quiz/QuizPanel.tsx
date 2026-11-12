'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/use-mutation';
import { learn, type AttemptSummary, type AttemptView, type LearnApi } from '@/lib/api/learn';
import { describeTimeLimit } from '@/lib/quiz/timer';
import { QuizAttempt } from './QuizAttempt';
import { QuizResult } from './QuizResult';
import styles from './Quiz.module.css';

export interface QuizPanelProps {
  courseId: string;
  lessonId: string;
  /** Staff preview the quiz in the builder; attempts are for students only. */
  viewer: 'STUDENT' | 'STAFF';
  /** Called after an attempt closes, so the course outline can refresh (a pass completes it). */
  onAttemptClosed?: () => void;
  /** True while an attempt is on screen, so the page can drop everything that is not the quiz. */
  onAttemptActive?: (active: boolean) => void;
  client?: LearnApi;
}

type Mode = { kind: 'overview' } | { kind: 'attempt'; attempt: AttemptView };

/** #75: quiz overview, start or resume, answering, submission and results. */
export function QuizPanel({
  courseId,
  lessonId,
  viewer,
  onAttemptClosed,
  onAttemptActive,
  client = learn,
}: QuizPanelProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'overview' });
  const opening = useMutation();
  const busy = opening.pending;
  // The player mounts one panel per lesson (keyed by lesson id), so state starts fresh.
  const loaded = useQuery({
    queryKey: ['quiz-overview', courseId, lessonId],
    queryFn: () => client.quizOverview(courseId, lessonId),
    staleTime: 0,
  });
  const attemptRunning = mode.kind === 'attempt' && mode.attempt.status === 'IN_PROGRESS';
  useEffect(() => {
    onAttemptActive?.(attemptRunning);
    return () => onAttemptActive?.(false);
  }, [attemptRunning, onAttemptActive]);
  const overview = loaded.data ?? null;
  const error = loaded.status === 'error' ? errorMessage(loaded.error) : null;
  const loadOverview = () => loaded.refetch();

  async function start() {
    await opening.run(async () => {
      setMode({ kind: 'attempt', attempt: await client.startAttempt(courseId, lessonId) });
    });
  }

  async function openAttempt(summary: AttemptSummary) {
    await opening.run(async () => {
      setMode({
        kind: 'attempt',
        attempt: await client.getAttempt(courseId, lessonId, summary.id),
      });
    });
  }

  function closed(attempt: AttemptView) {
    setMode({ kind: 'attempt', attempt });
    void loadOverview();
    onAttemptClosed?.();
  }

  function backToOverview() {
    setMode({ kind: 'overview' });
    void loadOverview();
  }

  if (mode.kind === 'attempt' && mode.attempt.status === 'IN_PROGRESS') {
    return (
      <QuizAttempt
        courseId={courseId}
        lessonId={lessonId}
        attempt={mode.attempt}
        timeLimitSeconds={overview?.timeLimitSeconds ?? null}
        client={client}
        onClosed={closed}
        onExit={backToOverview}
      />
    );
  }
  if (mode.kind === 'attempt') {
    return (
      <QuizResult
        attempt={mode.attempt}
        overview={overview}
        onBack={backToOverview}
        onRetry={overview && overview.attemptsRemaining !== 0 ? start : undefined}
        busy={busy}
      />
    );
  }

  if (!overview) {
    return error ? (
      <Alert tone="danger" title="The quiz could not be loaded">
        {error}
      </Alert>
    ) : (
      <Skeleton label="Loading quiz…" />
    );
  }

  const noAttemptsLeft = overview.attemptsRemaining === 0 && !overview.openAttemptId;
  return (
    <section className={styles.panel} aria-labelledby="quiz-heading">
      <div className="cluster">
        <h2 id="quiz-heading" className="visually-hidden">
          Quiz
        </h2>
        {overview.isBreakpoint && <Badge tone="warning">Checkpoint</Badge>}
        {overview.hasPassed && <Badge tone="success">Passed</Badge>}
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Questions</dt>
          <dd>
            {overview.questionCount} ({overview.totalMarks} mark
            {overview.totalMarks === 1 ? '' : 's'})
          </dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{describeTimeLimit(overview.timeLimitSeconds)}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>
            {overview.maxAttempts === null
              ? `${overview.attemptsUsed} used, unlimited`
              : `${overview.attemptsUsed} of ${overview.maxAttempts} used`}
          </dd>
        </div>
        {overview.passingScorePct !== null && (
          <div>
            <dt>Pass mark</dt>
            <dd>{overview.passingScorePct}%</dd>
          </div>
        )}
      </dl>

      {overview.isBreakpoint && !overview.hasPassed && (
        <p className={styles.muted}>Pass this checkpoint to unlock the lessons after it.</p>
      )}
      {viewer === 'STUDENT' && (
        <p className={styles.muted}>
          {overview.openAttemptId
            ? 'You have an attempt in progress. '
            : 'Starting uses one of your attempts. '}
          {overview.timeLimitSeconds !== null &&
            'The timer starts when you begin and keeps running if you leave the page. '}
          Answers are saved as you go.
        </p>
      )}

      {(opening.error ?? error) && <Alert tone="danger">{opening.error ?? error}</Alert>}

      {viewer === 'STAFF' ? (
        <Alert tone="info" title="Staff preview">
          Attempts are recorded for students only. Open the quiz builder to see the questions and
          answers.
        </Alert>
      ) : overview.questionCount === 0 ? (
        <Alert tone="info">This quiz has no questions yet.</Alert>
      ) : noAttemptsLeft ? (
        <Alert tone="warning">You have used all your attempts at this quiz.</Alert>
      ) : (
        <div>
          <Button onClick={start} loading={busy} loadingText="Opening…">
            {overview.openAttemptId
              ? 'Resume attempt'
              : overview.attemptsUsed > 0
                ? 'Try again'
                : 'Start quiz'}
          </Button>
        </div>
      )}

      {overview.attempts.length > 0 && (
        <div className={styles.history}>
          <h3>Your attempts</h3>
          <ul>
            {overview.attempts
              .filter((a) => a.status === 'SUBMITTED')
              .map((a) => (
                <li key={a.id}>
                  <span>
                    Attempt {a.attemptNumber}: <strong>{a.scorePct ?? 0}%</strong>
                    {a.isPassed === true && ' (passed)'}
                    {a.isPassed === false && ' (not passed)'}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openAttempt(a)}>
                    View result
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
