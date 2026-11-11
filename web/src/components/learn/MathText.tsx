import katex from 'katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import { Fragment, useMemo } from 'react';
import { splitMath } from '@/lib/learn/math-text';
import styles from './MathText.module.css';

export interface MathTextProps {
  text: string;
  /** Render as a block (paragraphs kept) rather than inline. */
  block?: boolean;
  className?: string;
}

function renderMath(value: string, display: boolean): string {
  // KaTeX escapes everything it outputs; trust: false refuses \href, \url and similar.
  return katex.renderToString(value, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 200,
    output: 'htmlAndMathml',
  });
}

/**
 * Text with LaTeX between `$...$` (inline) and `$$...$$` (display), as teachers write it (#71).
 * Chemistry works too (`$\ce{H2O}$`, mhchem). Display maths scrolls sideways on narrow screens
 * instead of overflowing, so questions stay legible at 380px. Bad LaTeX shows as red source text,
 * never as a crash.
 */
export function MathText({ text, block = false, className }: MathTextProps) {
  const segments = useMemo(() => splitMath(text), [text]);
  const Wrapper = block ? 'div' : 'span';
  return (
    <Wrapper
      className={[block ? styles.block : styles.inline, className].filter(Boolean).join(' ')}
    >
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <Fragment key={index}>{segment.value}</Fragment>
        ) : (
          <span
            key={index}
            className={segment.display ? styles.display : styles.math}
            // Output of KaTeX, which escapes its input (see renderMath).
            dangerouslySetInnerHTML={{ __html: renderMath(segment.value, segment.display) }}
          />
        ),
      )}
    </Wrapper>
  );
}
