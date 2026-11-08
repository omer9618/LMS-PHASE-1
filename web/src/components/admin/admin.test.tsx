import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboard, MeWithContext } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { SessionProvider } from '@/lib/session';
import { apiMock, resetMocks, router, setPathname } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { AdminShell, isCurrent } from './AdminShell';
import { ReasonAction } from './kit';
import { DecisionPanel } from './screens/VerificationScreen';
import { parseSettingInput } from './screens/SettingsScreen';
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
    apiMock.post.mockImplementation(async (path: string, body: { role: string }) => {
      expect(path).toBe('/auth/context');
      expect(body).toEqual({ role: 'ADMIN' });
      me = { ...DUAL, activeContext: 'ADMIN' };
      return me;
    });
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
    expect(apiMock.post).toHaveBeenCalledWith('/auth/context', { role: 'TEACHER' });
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
    const [path, body] = apiMock.post.mock.calls[0]!;
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
    expect(screen.getByText(/Short by PKR 500.00 against a total of PKR 1,500.00/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
    expect(await screen.findByText(/choose what to do/)).toBeVisible();
    expect(apiMock.post).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('What to do'), 'REQUEST_TOP_UP');
    await userEvent.click(screen.getByRole('button', { name: 'Record decision' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    expect(apiMock.post.mock.calls[0]![1]).toMatchObject({
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
      new ApiError('VERIFICATION_REFUSED', 'This order is not waiting for verification', {
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
    expect(apiMock.post).toHaveBeenCalledWith('/admin/verification/orders/o-1/reject', {
      rejectionReason: 'OTHER',
      notes: 'Wrong bank',
    });
  });
});

describe('screen helpers', () => {
  it('parses setting values by the setting type', () => {
    expect(parseSettingInput({ defaultValue: 48 }, '72')).toBe(72);
    expect(parseSettingInput({ defaultValue: 48 }, 'abc')).toBeNull();
    expect(parseSettingInput({ defaultValue: true }, false)).toBe(false);
    expect(parseSettingInput({ defaultValue: 'text' }, 'Bank: X')).toBe('Bank: X');
  });

  it('turns audit date filters into day boundaries', () => {
    expect(dayBoundary('', false)).toBeUndefined();
    expect(dayBoundary('2026-11-08', false)).toBe(
      new Date('2026-11-08T00:00:00.000').toISOString(),
    );
    expect(dayBoundary('2026-11-08', true)).toBe(new Date('2026-11-08T23:59:59.999').toISOString());
  });
});
