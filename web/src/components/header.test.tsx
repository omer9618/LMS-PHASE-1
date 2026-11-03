import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiMock, resetMocks, router, setPathname } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { SiteHeader } from './SiteHeader';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

beforeEach(() => {
  resetMocks();
});

describe('SiteHeader', () => {
  it('offers sign-in links that return to the current page', async () => {
    setPathname('/courses/abc');
    renderWithSession(<SiteHeader />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcourses%2Fabc',
    );
    expect(screen.getByRole('link', { name: 'Create account' })).toBeVisible();
  });

  it('shows the signed-in user and signs out', async () => {
    apiMock.post.mockResolvedValue(null);
    renderWithSession(<SiteHeader />, { ...STUDENT, roles: ['STUDENT', 'TEACHER'] });
    expect(await screen.findByText('Ayesha Khan')).toBeVisible();
    expect(screen.getByText('Teacher')).toBeVisible();
    expect(screen.queryByText('Student')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/auth/logout'));
    expect(router.push).toHaveBeenCalledWith('/courses');
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  it('falls back to the email when there is no name', async () => {
    renderWithSession(<SiteHeader />, { ...STUDENT, fullName: null });
    expect(await screen.findByText('ayesha@example.com')).toBeVisible();
  });

  it('reminds an unverified user to confirm their email', async () => {
    renderWithSession(<SiteHeader />, { ...STUDENT, isEmailVerified: false });
    expect(await screen.findByRole('region', { name: 'Email verification' })).toHaveTextContent(
      'ayesha@example.com',
    );
  });
});
