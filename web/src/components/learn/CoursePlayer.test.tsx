import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@/lib/api/errors';
import type { LearnApi, LearnerLesson, LearnerOutline } from '@/lib/api/learn';
import { CoursePlayer } from './CoursePlayer';

const replace = vi.fn();
let lessonParam: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/learn/c',
  useSearchParams: () => new URLSearchParams(lessonParam ? { lesson: lessonParam } : {}),
}));

function lesson(id: string, overrides: Partial<LearnerLesson> = {}): LearnerLesson {
  return {
    id,
    title: `Lesson ${id}`,
    type: 'TEXT',
    isFreePreview: false,
    durationSeconds: null,
    isCheckpoint: false,
    passingScorePct: null,
    state: 'AVAILABLE',
    lock: null,
    completion: null,
    resumePositionSeconds: null,
    ...overrides,
  };
}

const outline: LearnerOutline = {
  courseId: 'c',
  title: 'Mechanics',
  progressionMode: 'SEQUENTIAL',
  viewer: 'STUDENT',
  currentLessonId: 'b',
  completedLessons: 1,
  totalLessons: 3,
  completionPercent: 33,
  sections: [
    {
      id: 's',
      title: 'Forces',
      lessons: [
        lesson('a', { state: 'COMPLETED' }),
        lesson('b'),
        lesson('c', {
          state: 'LOCKED',
          lock: {
            cause: 'CHECKPOINT_NOT_PASSED',
            blockingLessonId: 'b',
            blockingLessonTitle: 'Lesson b',
            message: 'Pass the checkpoint quiz "Lesson b" to unlock this lesson',
          },
        }),
      ],
    },
  ],
};

function fakeClient(overrides: Partial<LearnApi> = {}) {
  return {
    outline: vi.fn().mockResolvedValue(outline),
    content: vi.fn().mockResolvedValue({
      id: 'b',
      title: 'Lesson b',
      type: 'TEXT',
      bodyText: 'Newton: $F = ma$',
      resources: [{ id: 'r', fileName: 'sheet.pdf', fileSizeBytes: 2048 }],
    }),
    complete: vi.fn().mockResolvedValue({ source: 'MANUAL', completedAt: '2026-11-03' }),
    resourceDownload: vi.fn(),
    ...overrides,
  } as unknown as LearnApi & Record<string, ReturnType<typeof vi.fn>>;
}

describe('CoursePlayer (#53)', () => {
  beforeEach(() => {
    replace.mockClear();
    lessonParam = null;
  });

  it('opens the current lesson with progress, text and files, and marks it complete', async () => {
    const client = fakeClient();
    render(<CoursePlayer courseId="c" client={client} />);
    expect(await screen.findByRole('heading', { name: 'Lesson b' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Course progress' })).toHaveAttribute(
      'aria-valuenow',
      '33',
    );
    expect(await screen.findByText('sheet.pdf')).toBeInTheDocument();
    expect(document.querySelector('.katex')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Mark as complete' }));
    await waitFor(() => expect(client.complete).toHaveBeenCalledWith('c', 'b'));
    expect(client.outline).toHaveBeenCalledTimes(2);
  });

  it('explains a locked lesson and links to the blocking one', async () => {
    lessonParam = 'c';
    render(<CoursePlayer courseId="c" client={fakeClient()} />);
    expect(await screen.findByText('This lesson is locked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Go to “Lesson b”/ }));
    expect(replace).toHaveBeenCalledWith('/learn/c?lesson=b', { scroll: true });
  });

  it('marks lesson states in the outline for screen readers', async () => {
    render(<CoursePlayer courseId="c" client={fakeClient()} />);
    const nav = await screen.findByRole('navigation', { name: 'Lessons' });
    expect(nav).toHaveTextContent(/Lesson a.*completed/);
    expect(nav).toHaveTextContent(/locked: Pass the checkpoint quiz/);
  });

  it('shows staff a preview badge and no completion button', async () => {
    render(
      <CoursePlayer
        courseId="c"
        client={fakeClient({ outline: vi.fn().mockResolvedValue({ ...outline, viewer: 'STAFF' }) })}
      />,
    );
    expect(await screen.findByText(/Staff preview/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull();
  });

  it('sends people without an enrollment to the course page', async () => {
    const client = fakeClient({
      outline: vi.fn().mockRejectedValue(
        new RequestError('ENROLLMENT_REQUIRED', {
          message: 'Enrol in this course to access it',
          status: 403,
        }),
      ),
    });
    render(<CoursePlayer courseId="c" client={client} />);
    expect(await screen.findByText('Enrol in this course to access it')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the course details' })).toHaveAttribute(
      'href',
      '/courses/c',
    );
  });
});
