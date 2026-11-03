/**
 * Splits question and lesson text into plain text and LaTeX (#71, #75). Teachers write inline
 * math between `$...$` and display math between `$$...$$`; `\$` is a literal dollar sign.
 * An unclosed delimiter is left as plain text rather than swallowing the rest of the question.
 */
export type MathSegment =
  { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

export function splitMath(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let text = '';
  let i = 0;

  const pushText = () => {
    if (text) segments.push({ kind: 'text', value: text });
    text = '';
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && input[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }
    if (ch !== '$') {
      text += ch;
      i += 1;
      continue;
    }
    const display = input[i + 1] === '$';
    const open = display ? 2 : 1;
    const close = findClosing(input, i + open, display);
    if (close === -1) {
      text += input.slice(i, i + open);
      i += open;
      continue;
    }
    const value = input.slice(i + open, close).trim();
    if (!value) {
      text += input.slice(i, close + open);
      i = close + open;
      continue;
    }
    pushText();
    segments.push({ kind: 'math', value, display });
    i = close + open;
  }
  pushText();
  return segments;
}

/** Index of the closing delimiter, skipping escaped dollars. -1 when there is none. */
function findClosing(input: string, from: number, display: boolean): number {
  for (let j = from; j < input.length; j += 1) {
    if (input[j] === '\\') {
      j += 1;
      continue;
    }
    if (input[j] !== '$') continue;
    if (!display) return j;
    if (input[j + 1] === '$') return j;
  }
  return -1;
}
