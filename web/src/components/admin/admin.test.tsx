import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboard, MeWithContext } from '@/lib/api/admin';
import { RequestError } from '@/lib/api/errors';
import { SessionProvider } from '@/lib/session';
import { apiMock, resetMocks, router, setPathname } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { AdminShell, isCurrent } from './AdminShell';
import { ReasonAction } from '@/components/ui';
import { DashboardScreen, formatWait } from './screens/DashboardScreen';
import { reviewChecklist } from './screens/CoursesScreen';
import { sortRun, toRunRow, totalsOwed, type RunRow } from './screens/PayoutRunScreen';
import { DecisionPanel, queueFlags } from './screens/VerificationScreen';
import { settingValue } from '@/lib/forms/admin';
import { dayBoundary } from './screens/AuditScreen';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const ADMIN: MeWithContext = {
  ...STUDENT,
  id: 'admin-1',
  fullName: 'Admin One',
  roles: ['ADMIN'],
  mfaEnabled: true,
  mfaVerified: true,
  activeContext: null,
  availableContexts: [],
};
const DUAL: MeWithContext = {
  ...ADMIN,
  roles: ['ADMIN', 'TEACHER'],
  activeContext: 'ADMIN',
  availableContexts: ['ADMIN', 'TEACHER'],
};

const DASHBOARD: AdminDashboard = {
  generatedAt: '2026-11-08T10:00:00.000Z',
  queues: {
    coursesPendingApproval: 2,
    teacherApplicationsOpen: 0,
    paymentVerificationsPending: 5,
    payoutConcerns: 1,
  },
  needsAttention: 8,
  today: { since: '2026-11-08T00:00:00.000Z', enrollmentsGranted: 3 },
};

beforeEach(() => {
  resetMocks();
  setPathname('/admin');
});

const gets = (path: string) => {
  if (path === '/admin/dashboard') return DASHBOARD;
  throw new Error(`unexpected GET ${path}`);
};

describe('AdminShell (#102, #109)', () => {
  it('shows the admin navigation with queue counts, in compact density', async () => {
    const { container } = renderWithSession(<AdminShell>content</AdminShell>, ADMIN, gets);
    expect(await screen.findByRole('navigation', { name: 'Admin' })).toBeVisible();
    expect(container.querySelector('[data-density="compact"]')).not.toBeNull();
    const verification = screen.getByRole('link', { name: /Payment verification/ });
    expect(verification).toHaveAttribute('href', '/admin/verification');
    expect(await screen.findByLabelText('5 waiting')).toBeVisible();
    expect(screen.getByLabelText('2 waiting')).toBeVisible();
    expect(screen.queryByLabelText('0 waiting')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('content')).toBeVisible();
    // A single-role admin has nothing to switch.
    expect(screen.queryByRole('button', { name: 'Switch to Teacher' })).not.toBeInTheDocument();
  });

  it('keeps students and teachers out', async () => {
    renderWithSession(<AdminShell>secret</AdminShell>, { ...STUDENT, roles: ['TEACHER'] });
    expect(await screen.findByText('Admins only')).toBeVisible();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('asks anonymous visitors to sign in, and admins without MFA to set it up', async () => {
    const { unmount } = renderWithSession(<AdminShell>secret</AdminShell>);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/admin',
    );
    unmount();
    renderWithSession(<AdminShell>secret</AdminShell>, { ...ADMIN, mfaEnabled: false });
    expect(await screen.findByRole('link', { name: 'Set it up now' })).toHaveAttribute(
      'href',
      '/account/mfa',
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('a dual-role account in the Teacher context must switch explicitly (#109)', async () => {
    let me: MeWithContext = { ...DUAL, activeContext: 'TEACHER' };
    apiMock.post.mockImplementation(
      async (path: string, _schema: unknown, body: { role: string }) => {
        expect(path).toBe('/auth/context');
        expect(body).toEqual({ role: 'ADMIN' });
        me = { ...DUAL, activeContext: 'ADMIN' };
        return me;
      },
    );
    apiMock.get.mockImplementation(async (path: string) => (path === '/auth/me' ? me : gets(path)));
    render(
      <SessionProvider>
        <AdminShell>secret</AdminShell>
      </SessionProvider>,
    );
    expect(await screen.findByText('You are working as Teacher')).toBeVisible();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }));
    expect(await screen.findByText('secret')).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });

  it('offers a labelled switch to Teacher for dual-role accounts', async () => {
    apiMock.post.mockResolvedValue({ ...DUAL, activeContext: 'TEACHER' });
    renderWithSession(<AdminShell>content</AdminShell>, DUAL, gets);
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to Teacher' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/teacher/courses'));
    expect(apiMock.post).toHaveBeenCalledWith('/auth/context', expect.anything(), {
      role: 'TEACHER',
    });
  });

  it('marks nested routes as current', () => {
    expect(isCurrent('/admin/users/abc', '/admin/users')).toBe(true);
    expect(isCurrent('/admin/users', '/admin')).toBe(false);
    expect(isCurrent('/admin', '/admin')).toBe(true);
  });
});

describe('ReasonAction', () => {
  it('needs a reason before it acts, and closes on success', async () => {
    const onConfirm = vi.fn(async () => true);
    renderWithSession(<ReasonAction label="Suspend" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    const form = screen.getByRole('form', { name: 'Suspend' });
    await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/at least 3 characters/)).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Reason/), 'Abusive messages');
    await userEvent.click(within(form).getByRole('button', { name: 'Suspend' }));
    expect(onConfirm).toHaveBeenCalledWith('Abusive messages');
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Suspend' })).toBeNull());
  });
});

describe('DecisionPanel (#64–#66)', () => {
  const renderPanel = (onDecided = vi.fn()) => {
    renderWithSession(
      <DecisionPanel
        orderId="o-1"
        totalMinor="150000"
        currency="PKR"
        suggestedMinor="150000"
        onDecided={onDecided}
      />,
    );
    return onDecided;
  };

  it('confirms an exact amount without a mismatch action', async () => {
    apiMock.post.mockResolvedValue({});
    const onDecided = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    const [path, , body] = apiMock.post.mock.calls[0]!;
    expect(path).toBe('/admin/verification/orders/o-1/confirm');
    expect(body).toMatchObject({ amountReceivedMinor: '150000' });
    expect(body.mismatchAction).toBeUndefined();
  });

  it('on a short payment, shows the difference and requires a choice', async () => {
    apiMock.post.mockResolvedValue({});
    renderPanel();
    const amount = screen.getByLabelText(/Amount received/);
    await userEvent.clear(amount);
    await userEvent.type(amount, '1000');
    expect(document.body).toHaveTextContent(/Short by PKR 500.00 against a total of PKR 1,500.00/);
    await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(await screen.findByText(/choose what to do/)).toBeVisible();
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('What to do'), 'REQUEST_TOP_UP');
    await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    expect(apiMock.post.mock.calls[0]![2]).toMatchObject({
      amountReceivedMinor: '100000',
      mismatchAction: 'REQUEST_TOP_UP',
    });
  });

  it('an overpayment cannot be topped up', async () => {
    renderPanel();
    const amount = screen.getByLabelText(/Amount received/);
    await userEvent.clear(amount);
    await userEvent.type(amount, '2000');
    const options = within(screen.getByLabelText('What to do'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'CONFIRM_ANYWAY', 'REJECT']);
  });

  it('rejects with a reason, requiring notes for Other, and shows API errors', async () => {
    apiMock.post.mockRejectedValueOnce(
      new RequestError('VERIFICATION_REFUSED', {
        message: 'This order is not waiting for verification',
        status: 422,
      }),
    );
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'OTHER');
    await userEvent.click(screen.getByRole('button', { name: 'Reject payment' }));
    expect(await screen.findByText(/Explain the rejection/)).toBeVisible();
    await userEvent.type(screen.getByLabelText(/Notes/), 'Wrong bank');
    await userEvent.click(screen.getByRole('button', { name: 'Reject payment' }));
    expect(await screen.findByText('This order is not waiting for verification')).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith(
      '/admin/verification/orders/o-1/reject',
      expect.anything(),
      {
        rejectionReason: 'OTHER',
        notes: 'Wrong bank',
      },
    );
  });
});

describe('screen helpers', () => {
  it('parses setting values by the setting type', () => {
    expect(settingValue(48).parse('72')).toBe(72);
    expect(settingValue(48).safeParse('abc').success).toBe(false);
    expect(settingValue(true).parse(false)).toBe(false);
    expect(settingValue('text').parse('Bank: X')).toBe('Bank: X');
  });

  it('turns audit date filters into day boundaries', () => {
    expect(dayBoundary('', false)).toBeUndefined();
    expect(dayBoundary('2026-11-08', false)).toBe(
      new Date('2026-11-08T00:00:00.000').toISOString(),
    );
    expect(dayBoundary('2026-11-08', true)).toBe(new Date('2026-11-08T23:59:59.999').toISOString());
  });
});

describe('DashboardScreen', () => {
  it('shows each queue with its action and the payment waiting time', async () => {
    renderWithSession(<DashboardScreen />, ADMIN, (path) => {
      if (path === '/admin/dashboard') return DASHBOARD;
      if (path === '/admin/verification/metrics') {
        return {
          queueSize: 7,
          turnaroundHours: 48,
          oldestWaitingSince: '2026-11-07T06:00:00.000Z',
          oldestWaitingMinutes: 3070,
          oldestOverTurnaround: true,
          overTurnaroundCount: 1,
        };
      }
      return undefined;
    });
    expect(await screen.findByText('Oldest 51h 10m · 1 past 48h')).toBeVisible();
    expect(screen.getByRole('link', { name: /Open queue/ })).toHaveAttribute(
      'href',
      '/admin/verification',
    );
    expect(screen.getByRole('link', { name: /Review: Courses to approve/ })).toHaveAttribute(
      'href',
      '/admin/courses',
    );
  });
});

describe('formatWait', () => {
  it('writes minutes as hours and minutes', () => {
    expect(formatWait(3070)).toBe('51h 10m');
    expect(formatWait(5)).toBe('0h 05m');
    expect(formatWait(null)).toBe('—');
  });
});

describe('queueFlags', () => {
  const base = {
    orderId: 'o-1',
    paymentReference: 'LMS-Q4HN-2BZE',
    student: { id: 's-1', email: 's@example.com', fullName: null },
    totalMinor: '320000',
    currency: 'PKR',
    items: [],
    proofs: [],
    waitingSince: null,
    waitingMinutes: 10,
    overTurnaround: false,
    claimed: { claimedMinor: '320000', differenceMinor: '0', mismatch: false },
    duplicateTransactionIdWarnings: [],
  };

  it('is empty for a clean order', () => {
    expect(queueFlags(base)).toEqual([]);
  });

  it('says short when the student claims less, and lists every problem', () => {
    const flags = queueFlags({
      ...base,
      overTurnaround: true,
      claimed: { claimedMinor: '300000', differenceMinor: '-20000', mismatch: true },
      duplicateTransactionIdWarnings: [
        {
          transactionId: 'IB-1',
          conflictingOrderIds: ['o-2'],
          conflictingPaymentReferences: ['LMS-B6TP-0WCE'],
          message: 'Used before',
        },
      ],
    });
    expect(flags.map((f) => f.label)).toEqual([
      'Amount short',
      'Txn ID used before',
      'Past turnaround',
    ]);
  });
});

describe('payout run', () => {
  const balance = (currency: string, balanceMinor: string) => ({
    currency,
    balanceMinor,
    earningsMinor: balanceMinor,
    refundsMinor: '0',
    payoutsMinor: '0',
    adjustmentsMinor: '0',
    entryCount: 1,
  });
  const teacher = (id: string, name: string) => ({
    id,
    email: `${id}@example.com`,
    fullName: name,
    isEmailVerified: true,
    status: 'ACTIVE' as const,
    roles: ['TEACHER' as const],
    mfaEnabled: false,
    guardianName: null,
    guardianEmail: null,
    guardianPhone: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastLoginAt: null,
  });
  const statement = (
    id: string,
    name: string,
    balances: ReturnType<typeof balance>[],
    payouts = [],
  ) =>
    toRunRow({
      teacher: teacher(id, name),
      balances,
      sales: {
        pending: { items: [], totalsByCurrency: [] },
        confirmed: { items: [], totalsByCurrency: [] },
      },
      refunds: { count: 0, items: [] },
      adjustments: { count: 0, items: [] },
      payouts: { count: payouts.length, items: payouts },
      ledger: { count: 0, items: [] },
    });

  it('marks who is due, who has a concern, and who is clear', () => {
    expect(statement('t-1', 'Sana', [balance('PKR', '4896000')]).status).toBe('DUE');
    expect(statement('t-2', 'Danish', [balance('PKR', '0')]).status).toBe('CLEAR');
    expect(statement('t-3', 'Noor', []).status).toBe('CLEAR');
    const disputed = statement(
      't-4',
      'Bilal',
      [balance('PKR', '1280000')],
      [{ status: 'DISPUTED', transferDate: '2026-11-01' } as never],
    );
    expect(disputed.status).toBe('DISPUTED');
  });

  it('sorts the most owed first and totals exactly per currency', () => {
    const rows: RunRow[] = [
      statement('a', 'A', [balance('PKR', '100')]),
      statement('b', 'B', [balance('PKR', '9007199254740993')]),
      statement('c', 'C', [balance('PKR', '-500'), balance('USD', '250')]),
    ];
    expect(sortRun(rows).map((r) => r.teacherId)).toEqual(['b', 'c', 'a']);
    expect(totalsOwed(rows)).toEqual([
      { currency: 'PKR', minor: '9007199254741093' },
      { currency: 'USD', minor: '250' },
    ]);
  });
});

describe('course review checklist', () => {
  const lesson = (type: string, video: 'READY' | 'PROCESSING' | null, preview: boolean) => ({
    id: `l-${type}-${String(video)}-${String(preview)}`,
    sectionId: 's-1',
    title: 'L',
    type,
    orderIndex: 0,
    bodyText: null,
    isFreePreview: preview,
    videoAsset: video ? { id: 'v-1', provider: 'BUNNY', status: video, durationSeconds: 60 } : null,
    resources: [],
  });
  const outline = (lessons: ReturnType<typeof lesson>[]) =>
    ({
      courseId: 'c-1',
      sections: [{ id: 's-1', courseId: 'c-1', title: 'S', orderIndex: 0, lessons }],
    }) as never;

  it('passes a course with a ready preview video', () => {
    const items = reviewChecklist(outline([lesson('VIDEO', 'READY', true)]));
    expect(items.every((i) => i.done)).toBe(true);
  });

  it('flags a video that is still processing', () => {
    const items = reviewChecklist(outline([lesson('VIDEO', 'PROCESSING', true)]));
    expect(items.find((i) => i.label === 'Every video is ready to play')?.done).toBe(false);
  });
});
