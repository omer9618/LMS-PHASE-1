/**
 * Client-side mirror of the API's numeric answer format (#70): plain decimal notation such as
 * "9.81", "-0.5" or ".5". The API is the authority; this only gives instant feedback.
 */
const PLAIN_DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function isPlainDecimal(value: string): boolean {
  const text = value.trim();
  return text.length > 0 && text.length <= 40 && PLAIN_DECIMAL.test(text);
}

/** What the result screen says when answers are hidden, per the quiz's reveal setting (#76). */
export function revealExplanation(
  reveal: 'NEVER' | 'AFTER_ATTEMPT' | 'AFTER_PASS' | 'AFTER_FINAL_ATTEMPT',
): string {
  switch (reveal) {
    case 'NEVER':
      return 'Your teacher has chosen not to show the correct answers for this quiz.';
    case 'AFTER_PASS':
      return 'Correct answers and explanations appear once you pass this quiz.';
    case 'AFTER_FINAL_ATTEMPT':
      return 'Correct answers and explanations appear after your final attempt.';
    case 'AFTER_ATTEMPT':
      return 'Correct answers and explanations appear once the attempt is submitted.';
  }
}
