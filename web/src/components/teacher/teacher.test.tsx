import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canRaiseConcern, type EarningsDashboard } from '@/lib/api/earnings';
import { ApiError } from '@/lib/api/errors';
import { moveItem, percentToBps, submitChecklist } from '@/lib/api/teacher';
import type { AuthoringLesson, Me, Outline, TeacherCourse } from '@/lib/api/types';
import { contentEditable, detailsEditable } from '@/lib/course-status';
import { formatBytes } from '@/lib/format';
import { apiMock, resetMocks, router, setPathname } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { detailsBody, initialValues } from './CourseDetailsForm';
import { CourseOverview, submissionProblems } from './CourseOverview';
import { CourseWorkspace } from './CourseWorkspace';
import { Earnings, formatBps } from './Earnings';
import { MyCourses } from './MyCourses';
import { NewCourse } from './NewCourse';
import { OutlineEditor } from './OutlineEditor';
import { checkResource } from './ResourcesPanel';
import { Roster } from './Roster';
import { TeacherGuard } from './TeacherGuard';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);
const tusUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tus', async (original) => ({
  ...(await original<typeof import('@/lib/tus')>()),
  tusUpload,
}));

const TEACHER: Me = { ...STUDENT, id: 't-1', roles: ['TEACHER'] };
const ID = '44444444-4444-4444-8444-444444444444';
const BOARD = '22222222-2222-4222-8222-222222222222';
const LEVEL = '33333333-3333-4333-8333-333333333333';
const SUBJECT = '11111111-1111-4111-8111-111111111111';

function course(overrides: Partial<TeacherCourse> = {}): TeacherCourse {
  return {
    id: ID,
    teacherId: 't-1',
    boardId: BOARD,
    levelId: LEVEL,
    subjectId: SUBJECT,
    syllabusArea: 'Mechanics',
    title: 'A Level Physics',
    description: null,
    priceMinor: null,
    currency: null,
    commissionRateBps: null,
    teacherProposedBps: null,
    isFree: false,
    status: 'DRAFT',
    progressionMode: 'FREE',
    audienceType: 'STUDENT',
    isEnrollmentOpen: true,
    createdAt: '2026-10-01T00:00:00Z',
    publishedAt: null,
    archivedAt: null,
    board: { id: BOARD, name: 'Cambridge' },
    level: { id: LEVEL, name: 'A Level' },
    subject: { id: SUBJECT, name: 'Physics' },
    rejectionReason: null,
    ...overrides,
  };
}

function lesson(overrides: Partial<AuthoringLesson> = {}): AuthoringLesson {
  return {
    id: 'l-1',
    sectionId: 's-1',
    title: 'Welcome',
    type: 'VIDEO',
    orderIndex: 0,
    bodyText: null,
    isFreePreview: false,
    videoAsset: null,
    resources: [],
    ...overrides,
  };
}

function outline(): Outline {
  return {
    courseId: ID,
    sections: [
      {
        id: 's-1',
        courseId: ID,
        title: 'Kinematics',
        orderIndex: 0,
        lessons: [lesson(), lesson({ id: 'l-2', title: 'Velocity', orderIndex: 1 })],
      },
      { id: 's-2', courseId: ID, title: 'Forces', orderIndex: 1, lessons: [] },
    ],
  };
}

const REFERENCE = (path: string): unknown => {
  if (path === '/boards') return [{ id: BOARD, name: 'Cambridge', code: 'CIE' }];
  if (path === `/boards/${BOARD}/levels`) {
    return [{ id: LEVEL, name: 'A Level', boardId: BOARD, orderIndex: 1 }];
  }
  if (path === '/subjects') return [{ id: SUBJECT, name: 'Physics' }];
  return undefined;
};

function renderTeacher(ui: ReactElement, gets: (path: string) => unknown) {
  return renderWithSession(ui, TEACHER, (path) => {
    const value = REFERENCE(path) ?? gets(path);
    if (value === undefined) throw new Error(`unexpected GET ${path}`);
    return value;
  });
}

function inWorkspace(
  ui: ReactElement,
  c: TeacherCourse,
  extra: (path: string) => unknown = () => undefined,
) {
  return renderTeacher(<CourseWorkspace courseId={ID}>{ui}</CourseWorkspace>, (path) => {
    if (path === `/teacher/courses/${ID}`) return c;
    if (path === `/teacher/courses/${ID}/outline`) return outline();
    return extra(path);
  });
}

beforeEach(() => {
  resetMocks();
  tusUpload.mockReset();
});

describe('helpers', () => {
  it('moves items up and down, not past the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('turns a typed percentage into basis points without floats', () => {
    expect(percentToBps('20')).toBe(2000);
    expect(percentToBps('17.5')).toBe(1750);
    expect(percentToBps('0.01')).toBe(1);
    expect(percentToBps('100')).toBe(10000);
    expect(percentToBps('100.01')).toBeNull();
    expect(percentToBps('abc')).toBeNull();
    expect(formatBps(1750)).toBe('17.5%');
    expect(formatBps(2000)).toBe('20%');
    expect(formatBps(5)).toBe('0.05%');
  });

  it('knows what may be edited in which status', () => {
    expect(detailsEditable('DRAFT')).toBe(true);
    expect(detailsEditable('PUBLISHED')).toBe(false);
    expect(contentEditable('PUBLISHED')).toBe(true);
    expect(contentEditable('PENDING_APPROVAL')).toBe(false);
  });

  it('builds the submit checklist from the outline', () => {
    expect(submitChecklist(null).every((i) => !i.done)).toBe(true);
    const ready = outline();
    ready.sections[0]!.lessons[0] = lesson({
      isFreePreview: true,
      videoAsset: { id: 'v', provider: 'BUNNY', status: 'PROCESSING', durationSeconds: null },
    });
    expect(submitChecklist(ready).every((i) => i.done)).toBe(true);
  });

  it('explains the server’s missing items', () => {
    const error = new ApiError('COURSE_INCOMPLETE', 'Mark at least one…', {
      info: { missing: ['freePreviewVideoLesson'] },
    });
    expect(submissionProblems(error)[0]).toMatch(/free preview/);
    expect(submissionProblems(new ApiError('CONFLICT', 'Stale'))).toEqual(['Stale']);
  });

  it('sends only changed details, with the classification together', () => {
    const c = course();
    expect(detailsBody({ ...initialValues(c), title: 'New title' }, c)).toEqual({
      title: 'New title',
    });
    expect(detailsBody({ ...initialValues(c), subjectId: 'other' }, c)).toEqual({
      boardId: BOARD,
      levelId: LEVEL,
      subjectId: 'other',
    });
    expect(detailsBody({ ...initialValues(c), syllabusArea: '' }, c)).toEqual({
      syllabusArea: null,
    });
  });

  it('checks PDF attachments', () => {
    expect(checkResource(new File(['x'], 'notes.pdf'))).toBeUndefined();
    expect(checkResource(new File(['x'], 'notes.docx'))).toMatch(/PDF/);
    expect(checkResource(null)).toMatch(/Choose/);
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('allows a concern only on a pending payout inside the window', () => {
    const now = new Date('2026-11-05T00:00:00Z');
    expect(
      canRaiseConcern({ status: 'PENDING', disputeDeadline: '2026-11-08T00:00:00Z' }, now),
    ).toBe(true);
    expect(
      canRaiseConcern({ status: 'PENDING', disputeDeadline: '2026-11-04T00:00:00Z' }, now),
    ).toBe(false);
    expect(
      canRaiseConcern({ status: 'ACCEPTED', disputeDeadline: '2026-11-08T00:00:00Z' }, now),
    ).toBe(false);
  });
});

describe('TeacherGuard', () => {
  it('keeps non-teachers out', async () => {
    renderWithSession(
      <TeacherGuard>
        <p>secret</p>
      </TeacherGuard>,
      STUDENT,
    );
    expect(await screen.findByText(/This area is for teachers/)).toBeVisible();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

describe('MyCourses', () => {
  it('lists the teacher’s courses with status', async () => {
    renderTeacher(<MyCourses />, (path) =>
      path === '/teacher/courses'
        ? [course(), course({ id: 'c-2', title: 'Chemistry', status: 'REJECTED' })]
        : undefined,
    );
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'A Level Physics' })).toHaveAttribute(
      'href',
      `/teacher/courses/${ID}`,
    );
    expect(within(table).getByText('Rejected')).toBeVisible();
    expect(screen.getByRole('link', { name: 'New course' })).toHaveAttribute(
      'href',
      '/teacher/courses/new',
    );
  });
});

describe('NewCourse', () => {
  it('creates a draft and opens its content', async () => {
    apiMock.post.mockResolvedValue(course());
    renderTeacher(<NewCourse />, () => undefined);
    await userEvent.type(screen.getByLabelText(/^Title/), 'A Level Physics');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Cambridge' })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/^Exam board/), BOARD);
    await waitFor(() => expect(screen.getByRole('option', { name: 'A Level' })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText(/^Level/), LEVEL);
    await userEvent.selectOptions(screen.getByLabelText(/^Subject/), SUBJECT);
    await userEvent.click(screen.getByRole('button', { name: 'Create course' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/teacher/courses/${ID}/content`));
    expect(apiMock.post).toHaveBeenCalledWith('/teacher/courses', expect.anything(), {
      boardId: BOARD,
      levelId: LEVEL,
      subjectId: SUBJECT,
      title: 'A Level Physics',
      progressionMode: 'FREE',
    });
  });

  it('asks for the required fields first', async () => {
    renderTeacher(<NewCourse />, () => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Create course' }));
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe('CourseOverview', () => {
  it('edits a draft’s details, sending only the change', async () => {
    apiMock.patch.mockResolvedValue(course({ title: 'Physics, revised' }));
    inWorkspace(<CourseOverview />, course());
    const title = await screen.findByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Physics, revised');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Details saved.')).toBeVisible();
    expect(apiMock.patch).toHaveBeenCalledWith(`/teacher/courses/${ID}`, expect.anything(), {
      title: 'Physics, revised',
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Physics, revised');
  });

  it('shows published details read-only with the reason', async () => {
    inWorkspace(
      <CourseOverview />,
      course({ status: 'PUBLISHED', publishedAt: '2026-10-05T00:00:00Z' }),
    );
    expect(await screen.findByText(/Details of a published course are locked/)).toBeVisible();
    expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
  });

  it('shows the rejection reason, read-only', async () => {
    inWorkspace(
      <CourseOverview />,
      course({ status: 'REJECTED', rejectionReason: 'The videos are too quiet.' }),
    );
    expect(await screen.findByText('The videos are too quiet.')).toBeVisible();
    expect(screen.getAllByText(/rejection is final/i).length).toBeGreaterThan(0);
  });

  it('submits for review and shows the server’s checklist errors', async () => {
    apiMock.post.mockRejectedValueOnce(
      new ApiError('COURSE_INCOMPLETE', 'x', { info: { missing: ['freePreviewVideoLesson'] } }),
    );
    inWorkspace(<CourseOverview />, course());
    const list = await screen.findByRole('list', { name: 'Before you submit' });
    await waitFor(() => expect(within(list).getAllByText(/To do:/).length).toBe(1));
    await userEvent.type(screen.getByLabelText(/^Proposed commission/), '17.5');
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText(/cannot be submitted yet/)).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith(`/teacher/courses/${ID}/submit`, expect.anything(), {
      teacherProposedBps: 1750,
    });

    apiMock.post.mockResolvedValueOnce(course({ status: 'PENDING_APPROVAL' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('In review', { selector: 'span' })).toBeVisible();
  });
});

describe('OutlineEditor', () => {
  it('reorders sections and lessons with move buttons', async () => {
    apiMock.put.mockResolvedValue(outline());
    inWorkspace(<OutlineEditor />, course());
    await userEvent.click(await screen.findByRole('button', { name: 'Move section “Forces” up' }));
    expect(apiMock.put).toHaveBeenCalledWith(
      `/teacher/courses/${ID}/sections/order`,
      expect.anything(),
      {
        sectionIds: ['s-2', 's-1'],
      },
    );
    expect(screen.getByRole('button', { name: 'Move section “Kinematics” up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move lesson “Welcome” down' }));
    expect(apiMock.put).toHaveBeenLastCalledWith(
      `/teacher/courses/${ID}/sections/s-1/lessons/order`,
      expect.anything(),
      { lessonIds: ['l-2', 'l-1'] },
    );
    expect(screen.getByRole('status')).toHaveTextContent('Moved “Welcome” down');
  });

  it('adds sections and lessons', async () => {
    apiMock.post.mockResolvedValue(outline());
    inWorkspace(<OutlineEditor />, course());
    await userEvent.type(await screen.findByLabelText('New section'), 'Energy');
    await userEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(apiMock.post).toHaveBeenCalledWith(
      `/teacher/courses/${ID}/sections`,
      expect.anything(),
      {
        title: 'Energy',
      },
    );

    const forces = screen.getByRole('region', { name: /Forces/ });
    await userEvent.type(within(forces).getByLabelText('New lesson'), 'Newton’s laws');
    await userEvent.selectOptions(within(forces).getByLabelText('Type'), 'TEXT');
    await userEvent.click(within(forces).getByRole('button', { name: 'Add lesson' }));
    expect(apiMock.post).toHaveBeenLastCalledWith(
      `/teacher/courses/${ID}/sections/s-2/lessons`,
      expect.anything(),
      {
        title: 'Newton’s laws',
        type: 'TEXT',
      },
    );
  });

  it('toggles a free preview', async () => {
    apiMock.patch.mockResolvedValue(outline());
    inWorkspace(<OutlineEditor />, course());
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Welcome' }));
    await userEvent.click(screen.getAllByLabelText('Free preview')[0]!);
    expect(apiMock.patch).toHaveBeenCalledWith(
      `/teacher/courses/${ID}/lessons/l-1`,
      expect.anything(),
      {
        isFreePreview: true,
      },
    );
  });

  it('uploads a video straight to the host over TUS', async () => {
    apiMock.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/video')) {
        return {
          videoAssetId: 'v-1',
          upload: {
            protocol: 'tus',
            endpoint: 'https://video.example/tusupload',
            headers: { VideoId: 'x' },
            metadata: {},
            expiresAt: '',
          },
        };
      }
      return { id: 'v-1', status: 'PROCESSING', durationSeconds: null };
    });
    tusUpload.mockResolvedValue('https://video.example/tusupload/1');
    inWorkspace(<OutlineEditor />, course());
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Welcome' }));
    const clip = new File([new Uint8Array(10)], 'clip.mp4', { type: 'video/mp4' });
    await userEvent.upload(screen.getByLabelText('Upload a video'), clip);
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText(/video host is processing it/)).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith(
      `/teacher/courses/${ID}/lessons/l-1/video`,
      expect.anything(),
      {
        title: 'Welcome',
      },
    );
    expect(tusUpload.mock.calls[0]![0]).toBe(clip);
    expect(tusUpload.mock.calls[0]![1].endpoint).toBe('https://video.example/tusupload');
  });

  it('attaches a PDF as multipart', async () => {
    apiMock.postForm.mockResolvedValue([]);
    inWorkspace(<OutlineEditor />, course());
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Velocity' }));
    await userEvent.upload(screen.getByLabelText(/^Attach a PDF/), new File(['%PDF'], 'notes.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }));
    await waitFor(() => expect(apiMock.postForm).toHaveBeenCalled());
    const [path, , form] = apiMock.postForm.mock.calls[0] as [string, unknown, FormData];
    expect(path).toBe(`/teacher/courses/${ID}/lessons/l-2/resources`);
    expect((form.get('file') as File).name).toBe('notes.pdf');
  });

  it('is read-only while in review', async () => {
    inWorkspace(<OutlineEditor />, course({ status: 'PENDING_APPROVAL' }));
    expect(await screen.findByText(/content is locked/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Move section/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New section')).not.toBeInTheDocument();
  });
});

describe('Roster', () => {
  it('lists students, view only', async () => {
    setPathname(`/teacher/courses/${ID}/enrollments`);
    inWorkspace(<Roster />, course({ status: 'PUBLISHED' }), (path) =>
      path === `/teacher/courses/${ID}/enrollments`
        ? {
            items: [
              {
                id: 'e-1',
                status: 'ACTIVE',
                source: 'PURCHASE',
                grantedAt: '2026-10-02T00:00:00Z',
                expiresAt: null,
                revokedAt: null,
                completionPercent: 60,
                student: { id: 's', fullName: 'Ayesha Khan', email: 'ayesha@example.com' },
              },
            ],
            total: 1,
            limit: 50,
            offset: 0,
          }
        : undefined,
    );
    const table = await screen.findByRole('table', { name: 'Students (1)' });
    expect(within(table).getByRole('rowheader')).toHaveTextContent('Ayesha Khan');
    expect(within(table).getByText('60%')).toBeVisible();
    expect(screen.getByText(/View only/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
  });
});

const EARNINGS: EarningsDashboard = {
  balances: [
    {
      currency: 'PKR',
      balanceMinor: '400000',
      earningsMinor: '1200000',
      refundsMinor: '0',
      payoutsMinor: '-800000',
      adjustmentsMinor: '0',
      entryCount: 3,
    },
  ],
  pendingSales: {
    items: [
      {
        id: 'oi-2',
        orderId: 'o-2',
        paymentReference: 'LMS-2',
        orderStatus: 'PROOF_SUBMITTED',
        currency: 'PKR',
        courseId: ID,
        courseTitle: 'A Level Physics',
        priceMinor: '500000',
        commissionRateBps: 2000,
        commissionMinor: '100000',
        netTeacherMinor: '400000',
        orderCreatedAt: '2026-11-01T00:00:00Z',
        orderVerifiedAt: null,
      },
    ],
    totalsByCurrency: [
      {
        currency: 'PKR',
        itemCount: 1,
        grossMinor: '500000',
        commissionMinor: '100000',
        netTeacherMinor: '400000',
      },
    ],
  },
  confirmedSales: { items: [], totalsByCurrency: [] },
  ledgerEntries: [
    {
      id: 'le-1',
      type: 'PAYOUT',
      amountMinor: '-800000',
      currency: 'PKR',
      orderItemId: null,
      payoutId: 'p-1',
      refundId: null,
      description: 'Payout',
      createdAt: '2026-11-03T00:00:00Z',
    },
  ],
  payouts: [
    {
      id: 'p-1',
      amountMinor: '800000',
      method: 'Bank transfer',
      transactionId: 'TX-9',
      periodStart: null,
      periodEnd: null,
      status: 'PENDING',
      recordedAt: '2026-11-03T00:00:00Z',
      transferDate: '2026-11-03',
      disputeDeadline: '2099-01-01T00:00:00Z',
      acceptedAt: null,
    },
  ],
};

describe('Earnings', () => {
  it('shows balance, sales, statement and payouts, and raises a concern', async () => {
    apiMock.post.mockResolvedValue({});
    renderTeacher(<Earnings />, (path) => {
      if (path === '/teacher/earnings') return EARNINGS;
      if (path === '/teacher/payouts/p-1') {
        return {
          payout: { ...EARNINGS.payouts[0], ledgerEntries: [], disputes: [] },
          coveredSales: [],
        };
      }
      return undefined;
    });
    expect(await screen.findByText('PKR 4,000.00', { selector: 'p' })).toBeVisible();
    const pending = screen.getByRole('region', { name: 'Pending sales' });
    expect(within(pending).getByText('PKR 1,000.00 (20%)')).toBeVisible();
    expect(screen.getByRole('table', { name: /Every entry/ })).toHaveTextContent('PKR -8,000.00');

    const payout = screen.getByRole('article', { name: /PKR 8,000.00/ });
    expect(within(payout).getByText('Paid, open for questions')).toBeVisible();
    await userEvent.click(within(payout).getByRole('button', { name: 'Details' }));
    await userEvent.type(await screen.findByLabelText('Raise a concern'), 'One sale is missing.');
    await userEvent.click(screen.getByRole('button', { name: 'Send concern' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/teacher/payouts/p-1/concerns', {
        reason: 'One sale is missing.',
      }),
    );
  });
});
