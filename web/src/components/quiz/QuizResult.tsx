'use client';

import { Alert, Badge, Button } from '@/components/ui';
import { MathText } from '@/components/learn/MathText';
import type { AttemptQuestion, AttemptView, QuizOverview } from '@/lib/api/learn';
import { revealExplanation } from '@/lib/quiz/answers';
import styles from './Quiz.module.css';

export interface QuizResultProps {
  attempt: AttemptView;
  overview: QuizOverview | null;
  onBack: () => void;
  onRetry?: () => void;
  busy?: boolean;
}

/**
 * A submitted attempt (#75, #76): score and pass/fail always; correct answers, marking and
 * explanations only when the API sends them (it applies the quiz's reveal rule).
 */
export function QuizResult({ attempt, overview, onBack, onRetry, busy }: QuizResultProps) {
  return (
    <section className={styles.panel} aria-labelledby="result-heading">
      <div className="cluster">
        <h2 id="result-heading">Attempt {attempt.attemptNumber} result</h2>
        {attempt.isPassed === true && <Badge tone="success">Passed</Badge>}
        {attempt.isPassed === false && <Badge tone="danger">Not passed</Badge>}
      </div>

      <p className={styles.score}>
        <span className={styles.scoreValue}>{attempt.scorePct ?? 0}%</span>
        {overview?.passingScorePct != null && (
          <span className={styles.muted}> (pass mark {overview.passingScorePct}%)</span>
        )}
      </p>

      {attempt.timedOut && (
        <Alert tone="warning" title="Time ran out">
          Only answers saved before the time limit were marked.
        </Alert>
      )}

      {attempt.answersRevealed ? (
        <ol className={styles.reviewList}>
          {attempt.questions.map((q, i) => (
            <ReviewItem key={q.id} number={i + 1} question={q} />
          ))}
        </ol>
      ) : (
        <>
          {overview && <Alert tone="info">{revealExplanation(overview.revealAnswers)}</Alert>}
          <ol className={styles.reviewList}>
            {attempt.questions.map((q, i) => (
              <li key={q.id} className={styles.reviewItem}>
                <p className={styles.questionNumber}>Question {i + 1}</p>
                <MathText text={q.contentText} block />
                <p>
                  Your answer: <AnswerText question={q} value={q.yourAnswer} />
                </p>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className={styles.stepper}>
        <Button variant="secondary" onClick={onBack}>
          Back to quiz
        </Button>
        {onRetry && attempt.isPassed !== true && (
          <Button onClick={onRetry} loading={busy} loadingText="Opening…">
            Try again
          </Button>
        )}
      </div>
    </section>
  );
}

function ReviewItem({ number, question }: { number: number; question: AttemptQuestion }) {
  const correct = question.isCorrect === true;
  return (
    <li className={styles.reviewItem} data-correct={correct ? 'true' : 'false'}>
      <div className="cluster">
        <p className={styles.questionNumber}>Question {number}</p>
        <Badge tone={correct ? 'success' : 'danger'}>
          {correct ? 'Correct' : 'Incorrect'} · {question.marksAwarded ?? 0}/{question.marks}
        </Badge>
      </div>
      <MathText text={question.contentText} block />
      <p>
        Your answer: <AnswerText question={question} value={question.yourAnswer} />
      </p>
      {!correct && question.correctAnswer !== undefined && (
        <p>
          Correct answer: <AnswerText question={question} value={question.correctAnswer} />
          {question.type === 'NUMERIC' &&
            question.numericTolerance &&
            question.numericTolerance !== '0' && (
              <span className={styles.muted}> (± {question.numericTolerance})</span>
            )}
        </p>
      )}
      {question.explanation && (
        <div className={styles.explanation}>
          <p className={styles.questionNumber}>Explanation</p>
          <MathText text={question.explanation} block />
        </div>
      )}
    </li>
  );
}

function AnswerText({
  question,
  value,
}: {
  question: AttemptQuestion;
  value: string | null | undefined;
}) {
  if (value === null || value === undefined || value === '') {
    return <em className={styles.muted}>no answer</em>;
  }
  if (question.type === 'MCQ') {
    const option = question.options?.find((o) => o.id === value);
    return option ? (
      <MathText text={option.text} />
    ) : (
      <em className={styles.muted}>unknown option</em>
    );
  }
  return (
    <strong>
      {value}
      {question.numericUnit ? ` ${question.numericUnit}` : ''}
    </strong>
  );
}
