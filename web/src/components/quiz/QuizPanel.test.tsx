import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { AttemptView, LearnApi, QuizOverview } from '@/lib/api/learn';
import { QuizPanel } from './QuizPanel';

const overview: QuizOverview = {
  quizId: 'quiz',
  lessonId: 'lesson',
  timeLimitSeconds: 600,
  maxAttempts: 2,
  isBreakpoint: true,
  passingScorePct: 60,
  revealAnswers: 'AFTER_ATTEMPT',
  questionCount: 2,
  totalMarks: 3,
  attemptsUsed: 0,
  attemptsRemaining: 2,
  hasPassed: false,
  openAttemptId: null,
  attempts: [],
};

const now = new Date().toISOString();
const inProgress: AttemptView = {
  id: 'attempt',
  attemptNumber: 1,
  status: 'IN_PROGRESS',
  startedAt: now,
  submittedAt: null,
  scorePct: null,
  isPassed: null,
  serverTime: now,
  deadline: new Date(Date.now() + 600_000).toISOString(),
  timedOut: false,
  answersRevealed: false,
  questions: [
    {
      id: 'q1',
      type: 'MCQ',
      contentText: 'Derivative of $x^2$?',
      imageUrl: null,
      options: [
        { id: 'a', text: '$x$' },
        { id: 'b', text: '$2x$' },
      ],
      numericUnit: null,
      marks: 2,
      yourAnswer: null,
    },
    {
      id: 'q2',
      type: 'NUMERIC',
      contentText: 'g?',
      imageUrl: null,
      options: null,
      numericUnit: 'm/s²',
      marks: 1,
      yourAnswer: null,
    },
  ],
};

const submitted: AttemptView = {
  ...inProgress,
  status: 'SUBMITTED',
  submittedAt: now,
  scorePct: 66,
  isPassed: true,
  answersRevealed: true,
  questions: [
    {
      ...inProgress.questions[0]!,
      yourAnswer: 'b',
      isCorrect: true,
      marksAwarded: 2,
      correctAnswer: 'b',
      explanation: 'Power rule',
    },
    {
      ...inProgress.questions[1]!,
      yourAnswer: '9',
      isCorrect: false,
      marksAwarded: 0,
      correctAnswer: '9.81',
      numericTolerance: '0.05',
      explanation: null,
    },
  ],
};

function fakeClient(overrides: Partial<LearnApi> = {}) {
  return {
    quizOverview: vi.fn().mockResolvedValue(overview),
    startAttempt: vi.fn().mockResolvedValue(inProgress),
    getAttempt: vi.fn().mockResolvedValue(submitted),
    saveAnswers: vi.fn().mockResolvedValue(inProgress),
    submitAttempt: vi.fn().mockResolvedValue(submitted),
    ...overrides,
  } as unknown as LearnApi & Record<string, ReturnType<typeof vi.fn>>;
}

describe('QuizPanel (#75)', () => {
  it('shows the overview, then takes an attempt through to the result', async () => {
    const client = fakeClient();
    const onClosed = vi.fn();
    render(
      <QuizPanel
        courseId="c"
        lessonId="lesson"
        viewer="STUDENT"
        client={client}
        onAttemptClosed={onClosed}
      />,
    );

    expect(await screen.findByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 used')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }));
    expect(await screen.findByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Time left/).parentElement).toHaveTextContent(/\d+:\d\d/);
    // LaTeX is rendered by KaTeX.
    expect(document.querySelector('.katex')).not.toBeNull();

    // Choosing an option saves at once.
    await userEvent.click(screen.getAllByRole('radio')[1]!);
    await waitFor(() =>
      expect(client.saveAnswers).toHaveBeenCalledWith('c', 'lesson', 'attempt', [
        { questionId: 'q1', answer: 'b' },
      ]),
    );

    // The navigator jumps to question 2; a bad numeric answer is flagged and not saved.
    const nav = screen.getByRole('navigation', { name: 'Questions' });
    await userEvent.click(within(nav).getByRole('button', { name: /Question 2/ }));
    const input = screen.getByRole('textbox', { name: 'Your answer' });
    await userEvent.type(input, '9.8 m/s');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(input);
    await userEvent.type(input, '9');

    await userEvent.click(screen.getByRole('button', { name: 'Review and submit' }));
    expect(screen.getByText('All 2 questions are answered.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(client.submitAttempt).toHaveBeenCalledWith('c', 'lesson', 'attempt', [
        { questionId: 'q1', answer: 'b' },
        { questionId: 'q2', answer: '9' },
      ]),
    );
    expect(await screen.findByText('Attempt 1 result')).toBeInTheDocument();
    expect(screen.getByText('66%')).toBeInTheDocument();
    expect(screen.getByText('Power rule')).toBeInTheDocument();
    expect(screen.getByText(/Incorrect · 0\/1/)).toBeInTheDocument();
    expect(onClosed).toHaveBeenCalled();
  });

  it('hides answers when the reveal rule does not allow them', async () => {
    const hidden: AttemptView = {
      ...submitted,
      answersRevealed: false,
      questions: inProgress.questions.map((q) => ({ ...q, yourAnswer: 'b' })),
    };
    const client = fakeClient({
      quizOverview: vi.fn().mockResolvedValue({
        ...overview,
        revealAnswers: 'NEVER',
        attemptsUsed: 1,
        attempts: [{ ...hidden }],
      }),
      getAttempt: vi.fn().mockResolvedValue(hidden),
    });
    render(<QuizPanel courseId="c" lessonId="lesson" viewer="STUDENT" client={client} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View result' }));
    expect(await screen.findByText(/chosen not to show the correct answers/)).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(screen.queryByText(/Incorrect/)).toBeNull();
  });

  it('shows the result when the API says time is up while saving', async () => {
    const client = fakeClient({
      saveAnswers: vi
        .fn()
        .mockRejectedValue(new ApiError('QUIZ_ATTEMPT_CLOSED', 'Time is up', { status: 409 })),
      getAttempt: vi.fn().mockResolvedValue({ ...submitted, timedOut: true }),
    });
    render(<QuizPanel courseId="c" lessonId="lesson" viewer="STUDENT" client={client} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start quiz' }));
    await userEvent.click((await screen.findAllByRole('radio'))[0]!);
    expect(await screen.findByText('Time ran out')).toBeInTheDocument();
  });

  it('lets staff preview without starting attempts', async () => {
    const client = fakeClient();
    render(<QuizPanel courseId="c" lessonId="lesson" viewer="STAFF" client={client} />);
    expect(await screen.findByText('Staff preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start quiz' })).toBeNull();
  });

  it('says when no attempts are left', async () => {
    const client = fakeClient({
      quizOverview: vi
        .fn()
        .mockResolvedValue({ ...overview, attemptsUsed: 2, attemptsRemaining: 0 }),
    });
    render(<QuizPanel courseId="c" lessonId="lesson" viewer="STUDENT" client={client} />);
    expect(await screen.findByText(/used all your attempts/)).toBeInTheDocument();
  });
});
