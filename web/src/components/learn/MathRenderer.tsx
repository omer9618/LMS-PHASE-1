import katex from 'katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import { Fragment } from 'react';
import type { MathSegment } from '@/lib/learn/math-text';
import styles from './MathText.module.css';

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
 * The segments of a text with LaTeX, typeset. This module holds KaTeX (about 300 KB with its
 * styles and the chemistry extension), so MathText loads it only for text that has maths in it.
 */
export default function MathRenderer({ segments }: { segments: MathSegment[] }) {
  return (
    <>
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
    </>
  );
}
