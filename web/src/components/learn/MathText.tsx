'use client';

import { Fragment, lazy, Suspense, useMemo } from 'react';
import { splitMath, type MathSegment } from '@/lib/learn/math-text';
import styles from './MathText.module.css';

export interface MathTextProps {
  text: string;
  /** Render as a block (paragraphs kept) rather than inline. */
  block?: boolean;
  className?: string;
}

/** The typesetter, fetched the first time a text with maths is shown (it is the biggest script). */
const MathRenderer = lazy(() => import('./MathRenderer'));

/** The text as written, LaTeX source included: what shows while the typesetter loads. */
function Source({ segments }: { segments: MathSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.kind === 'text' ? segment.value : <code>{segment.value}</code>}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Text with LaTeX between `$...$` (inline) and `$$...$$` (display), as teachers write it (#71).
 * Chemistry works too (`$\ce{H2O}$`, mhchem). Display maths scrolls sideways on narrow screens
 * instead of overflowing, so questions stay legible at 380px. Bad LaTeX shows as red source text,
 * never as a crash.
 *
 * Text without maths is shown as it is and never loads KaTeX.
 */
export function MathText({ text, block = false, className }: MathTextProps) {
  const segments = useMemo(() => splitMath(text), [text]);
  const hasMath = segments.some((segment) => segment.kind === 'math');
  const Wrapper = block ? 'div' : 'span';
  return (
    <Wrapper
      className={[block ? styles.block : styles.inline, className].filter(Boolean).join(' ')}
    >
      {hasMath ? (
        <Suspense fallback={<Source segments={segments} />}>
          <MathRenderer segments={segments} />
        </Suspense>
      ) : (
        <Source segments={segments} />
      )}
    </Wrapper>
  );
}
