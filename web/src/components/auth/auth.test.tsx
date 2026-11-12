import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@/lib/api/errors';
import { apiMock, resetMocks, router, setSearch } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { LoginForm } from './LoginForm';
import { registrationBody } from '@/lib/forms/auth';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { VerifyEmail } from './VerifyEmail';
import * as authSchema from '@/lib/api/schemas/auth';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

beforeEach(() => {
  resetMocks();
});

describe('LoginForm', () => {
  it('gives the standalone "Forgot your password?" link a full touch target', () => {
    renderWithSession(<LoginForm />);
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveClass(
      'standaloneLink',
    );
  });

  it('asks for missing fields without calling the API', async () => {
    renderWithSession(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(/Enter your email/);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('signs in and goes to ?next=', async () => {
    setSearch('next=/courses/abc');
    apiMock.post.mockResolvedValue({ user: STUDENT });
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), ' ayesha@example.com ');
    await userEvent.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/courses/abc'));
    expect(apiMock.post).toHaveBeenCalledWith('/auth/login', authSchema.loginResult, {
      email: 'ayesha@example.com',
      password: 'correct horse battery',
    });
  });

  it('lands staff in their own area when no page asked for sign-in', async () => {
    apiMock.post.mockResolvedValue({ user: STUDENT });
    renderWithSession(<LoginForm />, { ...STUDENT, roles: ['TEACHER'] });
    await userEvent.type(screen.getByLabelText(/^Email/), 'teacher@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/teacher/courses'));
  });

  it('ignores an off-site ?next=', async () => {
    setSearch('next=https://evil.example');
    apiMock.post.mockResolvedValue({ user: STUDENT });
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/^Password/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/courses'));
  });

  it('shows wrong credentials as an alert', async () => {
    apiMock.post.mockRejectedValue(
      new RequestError('INVALID_CREDENTIALS', {
        message: 'Invalid email or password',
        status: 401,
      }),
    );
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/^Password/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('runs the MFA step with the challenge token', async () => {
    apiMock.post.mockImplementation(async (path: string) => {
      if (path === '/auth/login') {
        return { mfaRequired: true, challengeToken: 'chal-1', expiresAt: '2026-11-02T10:00:00Z' };
      }
      return { user: { ...STUDENT, roles: ['ADMIN'] } };
    });
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'admin@lms.local');
    await userEvent.type(screen.getByLabelText(/^Password/), 'AdminPassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    const code = screen.getByLabelText(/^Authentication code/);
    await userEvent.type(code, '12a');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(code).toHaveAccessibleDescription(/6-digit code/);

    await userEvent.clear(code);
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/courses'));
    expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/mfa', expect.anything(), {
      challengeToken: 'chal-1',
      code: '123456',
    });
  });

  it('accepts a recovery code instead', async () => {
    apiMock.post.mockImplementation(async (path: string) =>
      path === '/auth/login'
        ? { mfaRequired: true, challengeToken: 'chal-2', expiresAt: '' }
        : { user: STUDENT },
    );
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'admin@lms.local');
    await userEvent.type(screen.getByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.click(await screen.findByRole('button', { name: /recovery code instead/ }));
    await userEvent.type(screen.getByLabelText(/^Recovery code/), 'abcd-efgh-ijkl');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenLastCalledWith('/auth/login/mfa', expect.anything(), {
        challengeToken: 'chal-2',
        recoveryCode: 'abcd-efgh-ijkl',
      }),
    );
  });

  it('returns to the password step when the challenge expired', async () => {
    apiMock.post.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return { mfaRequired: true, challengeToken: 'c', expiresAt: '' };
      throw new RequestError('INVALID_TOKEN', { message: 'Invalid or expired token', status: 400 });
    });
    renderWithSession(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'admin@lms.local');
    await userEvent.type(screen.getByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(await screen.findByLabelText(/^Authentication code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/expired/);
  });
});

describe('LoginForm for an admin without MFA', () => {
  it('sends them to set it up first (#16)', async () => {
    setSearch('next=/courses/abc');
    apiMock.post.mockResolvedValue({ user: STUDENT });
    renderWithSession(<LoginForm />, { ...STUDENT, roles: ['ADMIN'], mfaEnabled: false });
    await userEvent.type(screen.getByLabelText(/^Email/), 'new.admin@lms.local');
    await userEvent.type(screen.getByLabelText(/^Password/), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/account/mfa?next=%2Fcourses%2Fabc'),
    );
  });
});

describe('RegisterForm', () => {
  it('leaves empty guardian fields out of the request', () => {
    expect(
      registrationBody({
        fullName: ' Ayesha Khan ',
        email: 'a@b.co',
        password: 'long enough pw',
        guardianName: '',
        guardianEmail: '  ',
        guardianPhone: '+92 300 1234567',
      }),
    ).toEqual({
      fullName: 'Ayesha Khan',
      email: 'a@b.co',
      password: 'long enough pw',
      guardianPhone: '+92 300 1234567',
    });
  });

  it('registers without guardian details and confirms', async () => {
    apiMock.post.mockResolvedValue({ user: STUDENT });
    renderWithSession(<RegisterForm />);
    expect(screen.getByRole('group', { name: /guardian \(optional\)/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Ayesha Khan');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ayesha@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'a long passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/register', expect.anything(), {
      fullName: 'Ayesha Khan',
      email: 'ayesha@example.com',
      password: 'a long passphrase',
    });
  });

  it('validates before sending', async () => {
    renderWithSession(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/^Password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText(/^Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(/at least 10/i);
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('puts API field errors on their fields', async () => {
    apiMock.post.mockRejectedValue(
      new RequestError('VALIDATION_FAILED', {
        message: 'Password must not contain your email address',
        status: 400,
        info: { field: 'password' },
      }),
    );
    renderWithSession(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Ayesha Khan');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ayesha@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'ayesha12345');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(
        /must not contain your email/,
      ),
    );
  });

  it('shows a taken email', async () => {
    apiMock.post.mockRejectedValue(
      new RequestError('CONFLICT', { message: 'Email already registered' }),
    );
    renderWithSession(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Ayesha Khan');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ayesha@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'a long passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
  });
});

describe('VerifyEmail', () => {
  it('sends the token once and confirms', async () => {
    setSearch('token=tok-1');
    apiMock.post.mockResolvedValue({ verified: true });
    renderWithSession(<VerifyEmail />, STUDENT);
    expect(await screen.findByText('Email verified')).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith('/auth/verify-email', expect.anything(), {
      token: 'tok-1',
    });
  });

  it('explains an invalid link and offers a resend when signed in', async () => {
    setSearch('token=used');
    apiMock.post.mockImplementation(async (path: string) => {
      if (path === '/auth/verify-email')
        throw new RequestError('INVALID_TOKEN', { message: 'Invalid token' });
      return { sent: true };
    });
    renderWithSession(<VerifyEmail />, { ...STUDENT, isEmailVerified: false });
    expect(await screen.findByText('This link is invalid or has expired')).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/check your inbox/i)).toBeVisible();
  });

  it('handles a missing token without calling the API', async () => {
    renderWithSession(<VerifyEmail />);
    expect(await screen.findByText('Open the link from your email')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('standaloneLink');
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordForm', () => {
  it('always confirms in the same words', async () => {
    apiMock.post.mockResolvedValue({ requested: true });
    renderWithSession(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/if an account exists/i)).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/password-reset/request', expect.anything(), {
      email: 'nobody@example.com',
    });
  });
});

describe('ResetPasswordForm', () => {
  it('resets with the token from the link', async () => {
    setSearch('token=reset-1');
    apiMock.post.mockResolvedValue({ reset: true });
    renderWithSession(<ResetPasswordForm />);
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await userEvent.type(screen.getByLabelText(/^New password/), 'a brand new phrase');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/auth/password-reset/confirm', expect.anything(), {
      token: 'reset-1',
      password: 'a brand new phrase',
    });
  });

  it('uses welcome wording for new staff accounts', async () => {
    setSearch('token=t&welcome=1');
    apiMock.post.mockResolvedValue({ reset: true });
    renderWithSession(<ResetPasswordForm />);
    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeVisible();
    expect(screen.getByText(/administrator created your account/)).toBeVisible();
    await userEvent.type(screen.getByLabelText(/^New password/), 'a brand new phrase');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('heading', { name: 'Your password is set' })).toBeVisible();
  });

  it('checks the confirmation matches', async () => {
    setSearch('token=t');
    renderWithSession(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/^New password/), 'a brand new phrase');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'something else');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByLabelText(/^Confirm new password/)).toHaveAccessibleDescription(
      /do not match/,
    );
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('explains an expired link', async () => {
    setSearch('token=old');
    apiMock.post.mockRejectedValue(new RequestError('INVALID_TOKEN', { message: 'Invalid token' }));
    renderWithSession(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/^New password/), 'a brand new phrase');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'a brand new phrase');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('This link is invalid or has expired')).toBeVisible();
    const again = screen.getByRole('link', { name: 'Request a new link' });
    expect(again).toHaveAttribute('href', '/forgot-password');
    expect(again).toHaveClass('standaloneLink');
    expect(screen.getByText(/expire after 30 minutes/)).toBeVisible();
  });
});
