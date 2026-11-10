import { Icon } from './Icon';
import type { ReactNode } from 'react';
import { Badge } from './Badge';
import styles from './MarkSheet.module.css';

export interface MarkPoint {
  /** "M1 · Method", "A1 · Accuracy". */
  code: string;
  text: ReactNode;
  awarded: boolean;
}

export interface MarkSheetProps {
  /** "5054 · Motion check · Q3 of 5". */
  heading: ReactNode;
  marks: number;
  /** The student's answer, with its unit; the box is tinted by whether it earned the marks. */
  answer: { value: ReactNode; unit?: string; correct: boolean };
  question: ReactNode;
  /** A worked equation, shown on graph paper. */
  equation?: ReactNode;
  points: MarkPoint[];
  /** Time left on a timed quiz, "11:42 left". */
  timer?: string;
}

/**
 * The signature pattern: a question set like a printed paper beside the mark scheme that grades
 * it. Used on the home page and in the quiz results; the quiz builder's preview uses the same
 * paper look.
 */
export function MarkSheet({
  heading,
  marks,
  answer,
  question,
  equation,
  points,
  timer,
}: MarkSheetProps) {
  const awarded = points.filter((p) => p.awarded).length;
  return (
    <div className={styles.sheet}>
      <div className={styles.top}>
        <span className="mono">{heading}</span>
        <span className={styles.chips}>
          <Badge tone="primary">[{marks} marks]</Badge>
          {timer && <Badge tone="warning">{timer}</Badge>}
        </span>
      </div>
      <div className={styles.columns}>
        <div className={styles.paper}>
          <span className="eyebrow">Question paper</span>
          <p className={styles.question}>{question}</p>
          {equation && <div className={`grid-paper ${styles.equation}`}>{equation}</div>}
          <div className={styles.answerGroup}>
            <span className={styles.answerLabel}>Your answer</span>
            <span className={styles.answer} data-correct={answer.correct || undefined}>
              {answer.value}
              {answer.unit && <span className="muted"> {answer.unit}</span>}
            </span>
          </div>
        </div>
        <div className={styles.scheme}>
          <div className={styles.schemeHead}>
            <span className="eyebrow">Mark scheme</span>
            <Badge tone={awarded === points.length ? 'success' : 'warning'}>
              Awarded {awarded}/{points.length}
            </Badge>
          </div>
          {points.map((p) => (
            <div key={p.code} className={styles.point}>
              <span className={styles.code} data-awarded={p.awarded || undefined}>
                <Icon name={p.awarded ? 'check' : 'cross'} /> {p.code}
              </span>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
