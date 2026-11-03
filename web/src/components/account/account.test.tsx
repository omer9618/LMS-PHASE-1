import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherApplicationForm, checkCv } from '@/components/apply/TeacherApplicationForm';
import { DEV_CAPTCHA_TOKEN } from '@/components/Captcha';
import { StudentDashboard, sortEntries } from '@/components/dashboard/StudentDashboard';
import { ApiError } from '@/lib/api/errors';
import type { DashboardEntry, Me } from '@/lib/api/types';
import { needsMfaSetup } from '@/lib/session';
import { apiMock, resetMocks, setSearch } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { groupSecret, MfaSetup } from './MfaSetup';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') },
}));

const ADMIN: Me = { ...STUDENT, id: 'admin-1', roles: ['ADMIN'], mfaEnabled: false };

beforeEach(() => {
  resetMocks();
});

function file(name: string, size: number, type = 'application/pdf'): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('checkCv', () => {
  it('accepts PDF and Word up to 5 MB', () => {
    expect(checkCv(file('cv.pdf', 1000))).toBeUndefined();
    expect(checkCv(file('CV.DOCX', 1000))).toBeUndefined();
    expect(checkCv(file('cv.doc', 5 * 1024 * 1024))).toBeUndefined();
  });

  it('rejects missing, wrong type, empty and too large', () => {
    expect(checkCv(null)).toMatch(/attach/i);
    expect(checkCv(file('cv.png', 10, 'image/png'))).toMatch(/PDF or Word/);
    expect(checkCv(file('cv.pdf', 0))).toMatch(/empty/);
    expect(checkCv(file('cv.pdf', 5 * 1024 * 1024 + 1))).toMatch(/at most 5 MB/);
  });
});

describe('TeacherApplicationForm', () => {
  async function fillIn() {
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Omar Siddiqui');
    await userEvent.type(screen.getByLabelText(/^Email/), 'omar@example.com');
    await userEvent.type(screen.getByLabelText(/^Subjects/), 'A Level Physics');
    await userEvent.upload(screen.getByLabelText(/^CV/), file('cv.pdf', 2048));
  }

  it('sends a multipart application with the CV and captcha token', async () => {
    apiMock.postForm.mockResolvedValue({ id: 'a-1', status: 'SUBMITTED', submittedAt: '' });
    renderWithSession(<TeacherApplicationForm />);
    expect(screen.getByTestId('captcha-disabled')).toBeVisible();
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('heading', { name: 'Application received' })).toBeVisible();

    const [path, form] = apiMock.postForm.mock.calls[0] as [string, FormData];
    expect(path).toBe('/teacher-applications');
    expect(form.get('applicantName')).toBe('Omar Siddiqui');
    expect(form.get('applicantEmail')).toBe('omar@example.com');
    expect(form.get('subjects')).toBe('A Level Physics');
    expect(form.has('applicantPhone')).toBe(false);
    expect(form.get('captchaToken')).toBe(DEV_CAPTCHA_TOKEN);
    expect((form.get('cv') as File).name).toBe('cv.pdf');
  });

  it('requires a CV of the right kind before sending', async () => {
    renderWithSession(<TeacherApplicationForm />);
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Omar Siddiqui');
    await userEvent.type(screen.getByLabelText(/^Email/), 'omar@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(screen.getByLabelText(/^CV/)).toHaveAccessibleDescription(/Attach your CV/);
    expect(apiMock.postForm).not.toHaveBeenCalled();
  });

  it('explains a failed captcha', async () => {
    apiMock.postForm.mockRejectedValue(new ApiError('CAPTCHA_FAILED', 'Captcha failed'));
    renderWithSession(<TeacherApplicationForm />);
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/human check failed/i);
  });

  it('puts an API field error on the CV', async () => {
    apiMock.postForm.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 'A CV file is required', { info: { field: 'cv' } }),
    );
    renderWithSession(<TeacherApplicationForm />);
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^CV/)).toHaveAccessibleDescription(/A CV file is required/),
    );
  });
});

describe('MFA set-up', () => {
  it('knows who must enrol', () => {
    expect(needsMfaSetup(ADMIN)).toBe(true);
    expect(needsMfaSetup({ ...ADMIN, mfaEnabled: true })).toBe(false);
    expect(needsMfaSetup(STUDENT)).toBe(false);
    expect(needsMfaSetup(null)).toBe(false);
  });

  it('groups the secret for typing', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('enrols: start, scan, confirm, then shows recovery codes once', async () => {
    setSearch('next=/admin');
    apiMock.post.mockImplementation(async (path: string) => {
      if (path === '/auth/mfa/setup') {
        return { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/LMS:admin?secret=X' };
      }
      if (path === '/auth/mfa/enable')
        return { recoveryCodes: ['aaaa-bbbb-cccc', 'dddd-eeee-ffff'] };
      throw new Error(path);
    });
    renderWithSession(<MfaSetup />, ADMIN, (path) => {
      if (path === '/auth/mfa')
        return { enabled: false, required: true, recoveryCodesRemaining: 0 };
      throw new Error(path);
    });
    expect(await screen.findByText(/Admin accounts must use two-step/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Start set-up' }));
    expect(await screen.findByText('JBSW Y3DP EHPK 3PXP')).toBeVisible();
    expect(await screen.findByAltText(/QR code/)).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:/),
    );

    await userEvent.type(screen.getByLabelText(/^Authentication code/), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on two-step verification' }));
    expect(screen.getByLabelText(/^Authentication code/)).toHaveAccessibleDescription(/6-digit/);

    await userEvent.clear(screen.getByLabelText(/^Authentication code/));
    await userEvent.type(screen.getByLabelText(/^Authentication code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on two-step verification' }));
    expect(await screen.findByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/mfa/enable', { code: '123456' });
    expect(screen.getByText('aaaa-bbbb-cccc')).toBeVisible();

    // Continue only after confirming the codes are saved.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('I have saved my recovery codes'));
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/admin');
  });

  it('shows a wrong code', async () => {
    apiMock.post.mockImplementation(async (path: string) => {
      if (path === '/auth/mfa/setup') return { secret: 'ABCD', otpauthUri: 'otpauth://x' };
      throw new ApiError('INVALID_MFA_CODE', 'That code is not valid');
    });
    renderWithSession(<MfaSetup />, ADMIN, () => ({
      enabled: false,
      required: true,
      recoveryCodesRemaining: 0,
    }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start set-up' }));
    await userEvent.type(await screen.findByLabelText(/^Authentication code/), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on two-step verification' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Authentication code/)).toHaveAccessibleDescription(
        /not valid/,
      ),
    );
  });

  it('replaces recovery codes when MFA is already on', async () => {
    apiMock.post.mockResolvedValue({ recoveryCodes: ['new1-new1-new1'] });
    renderWithSession(<MfaSetup />, { ...ADMIN, mfaEnabled: true }, () => ({
      enabled: true,
      required: true,
      recoveryCodesRemaining: 3,
    }));
    expect(await screen.findByText(/3 unused recovery codes/)).toBeVisible();
    await userEvent.type(screen.getByLabelText(/^Authentication code/), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Create new recovery codes' }));
    expect(await screen.findByText('new1-new1-new1')).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/mfa/recovery-codes', { code: '654321' });
  });
});

const ENTRY: DashboardEntry = {
  id: 'e-1',
  status: 'ACTIVE',
  source: 'FREE',
  grantedAt: '2026-10-01T00:00:00Z',
  expiresAt: null,
  access: 'ACTIVE',
  completionPercent: 40,
  completedLessons: 2,
  totalLessons: 5,
  course: {
    id: 'c-1',
    title: 'A Level Physics',
    status: 'PUBLISHED',
    subject: { id: 's', name: 'Physics' },
    teacher: { id: 't', fullName: 'Omar Siddiqui' },
  },
};

describe('StudentDashboard', () => {
  it('lists courses with completion and a way to continue', async () => {
    renderWithSession(<StudentDashboard />, STUDENT, (path) => {
      if (path === '/me/enrollments') {
        return [
          {
            ...ENTRY,
            id: 'e-2',
            access: 'EXPIRED',
            expiresAt: '2026-09-01T00:00:00Z',
            course: { ...ENTRY.course, id: 'c-2', title: 'Old course' },
          },
          ENTRY,
        ];
      }
      throw new Error(path);
    });
    const progress = await screen.findByRole('progressbar', {
      name: 'A Level Physics: 40% complete',
    });
    expect(progress).toHaveAttribute('value', '40');
    expect(screen.getAllByText(/2 of 5 lessons/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Continue learning' })).toHaveAttribute(
      'href',
      '/learn/c-1',
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['A Level Physics', 'Old course']);
    expect(screen.getByText('Expired')).toBeVisible();
    expect(screen.getByText(/Access ended/)).toBeVisible();
  });

  it('has an empty state', async () => {
    renderWithSession(<StudentDashboard />, STUDENT, () => []);
    expect(await screen.findByText(/not enrolled in any course/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse courses' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });

  it('asks visitors to sign in', async () => {
    renderWithSession(<StudentDashboard />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/dashboard',
    );
  });

  it('sorts active first, newest grant first', () => {
    const a = { ...ENTRY, id: 'a', grantedAt: '2026-01-01' };
    const b = { ...ENTRY, id: 'b', grantedAt: '2026-05-01' };
    const c = { ...ENTRY, id: 'c', access: 'REVOKED' as const, grantedAt: '2026-12-01' };
    expect(sortEntries([c, a, b]).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});
