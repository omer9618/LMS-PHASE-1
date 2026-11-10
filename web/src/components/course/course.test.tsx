import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { CourseDetail } from '@/lib/api/schemas/catalogue';
import { COURSE_ID, courseDetail } from '@/test/fixtures';
import { apiMock, resetMocks } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { CourseDetailView } from './CourseDetailView';
import * as catalogueSchema from '@/lib/api/schemas/catalogue';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const EMBED = 'https://iframe.mediadelivery.net/embed/1/abc?token=t&expires=1';

function renderCourse(
  course: CourseDetail | Error,
  me: typeof STUDENT | null = null,
  enrollments: unknown[] = [],
) {
  return renderWithSession(<CourseDetailView courseId={COURSE_ID} />, me, (path) => {
    if (path === `/catalogue/courses/${COURSE_ID}`) {
      if (course instanceof Error) throw course;
      return course;
    }
    if (path === `/courses/${COURSE_ID}/lessons/l-1/playback`) {
      return { embedUrl: EMBED, expiresAt: '2026-11-02T10:00:00Z', durationSeconds: 300 };
    }
    if (path === '/me/enrollments') return enrollments;
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  resetMocks();
});

describe('CourseDetailView', () => {
  it('shows the course, its syllabus coverage, pricing and teacher (#43)', async () => {
    renderCourse(courseDetail());
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'A Level Physics: Mechanics',
    );
    expect(screen.getAllByText('PKR 15,000.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Syllabus coverage' })).toBeVisible();
    expect(screen.getByText('Paper 1: Mechanics')).toBeVisible();
    expect(screen.getByRole('heading', { name: /Kinematics/ })).toBeVisible();
    expect(screen.getByText('Velocity')).toBeVisible();
    expect(screen.getByText('Reading (PDF)')).toBeVisible();
    expect(screen.getByText('20 min')).toBeVisible();
    expect(screen.getByText('Ten years teaching physics.')).toBeVisible();
    expect(screen.getByText('MSc Physics')).toBeVisible();
    expect(screen.getByText(/Step by step/)).toBeVisible();
  });

  it('links the teacher to their public profile only when it is published (#101)', async () => {
    renderCourse(courseDetail());
    const links = await screen.findAllByRole('link', { name: 'Omar Siddiqui' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/teachers/t-1');
  });

  it('does not link an unpublished teacher profile', async () => {
    const detail = courseDetail();
    renderCourse({ ...detail, teacher: { ...detail.teacher, profile: null } });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Omar Siddiqui' })).not.toBeInTheDocument();
  });

  it('plays a free-preview lesson in an iframe with a strict referrer policy', async () => {
    renderCourse(courseDetail());
    await userEvent.click(await screen.findByRole('button', { name: '▶ Welcome' }));
    const frame = await screen.findByTitle('Preview: Welcome');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', EMBED);
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(apiMock.get).toHaveBeenCalledWith(
      `/courses/${COURSE_ID}/lessons/l-1/playback`,
      catalogueSchema.playback,
      undefined,
      expect.anything(),
    );
  });

  it('has no demo section without demo lessons', async () => {
    renderCourse(courseDetail({ demoLessonIds: [] }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('heading', { name: 'Watch a demo' })).not.toBeInTheDocument();
  });

  it('asks visitors to sign in before a free enrollment', async () => {
    renderCourse(courseDetail({ isFree: true, priceMinor: null }));
    const link = await screen.findByRole('link', { name: 'Sign in to enroll for free' });
    expect(link).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/courses/${COURSE_ID}`)}`,
    );
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
  });

  it('enrolls a signed-in student in a free course (#47)', async () => {
    apiMock.post.mockResolvedValue({ id: 'e-1', status: 'ACTIVE' });
    renderCourse(courseDetail({ isFree: true, priceMinor: null }), STUDENT);
    await userEvent.click(await screen.findByRole('button', { name: 'Enroll for free' }));
    expect(await screen.findByText('You are enrolled')).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith(`/courses/${COURSE_ID}/enroll`, expect.anything());
  });

  it('shows a refused enrollment', async () => {
    apiMock.post.mockRejectedValue(
      new ApiError('ENROLLMENT_REFUSED', 'Enrollment is closed for this course'),
    );
    renderCourse(courseDetail({ isFree: true, priceMinor: null }), STUDENT);
    await userEvent.click(await screen.findByRole('button', { name: 'Enroll for free' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enrollment is closed for this course',
    );
  });

  it('recognises an existing enrollment', async () => {
    renderCourse(courseDetail({ isFree: true, priceMinor: null }), STUDENT, [
      { id: 'e-1', access: 'ACTIVE', course: { id: COURSE_ID, title: 'x' } },
    ]);
    expect(await screen.findByText('You are enrolled')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enroll for free' })).not.toBeInTheDocument();
  });

  it('has no free-enroll button for paid or closed courses', async () => {
    renderCourse(courseDetail({ isEnrollmentOpen: false }), STUDENT);
    expect(await screen.findByText(/Enrollment for this course is closed/)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Enroll for free' })).not.toBeInTheDocument(),
    );
  });

  it('says when a course is not available', async () => {
    renderCourse(new ApiError('NOT_FOUND', 'Resource not found', { status: 404 }));
    expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse all courses' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });
});
