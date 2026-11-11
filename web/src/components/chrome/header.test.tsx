import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiMock, resetMocks, router, setPathname } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { BrandMark } from './BrandMark';
import { SiteHeader } from './SiteHeader';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

beforeEach(() => {
  resetMocks();
});

describe('BrandMark', () => {
  it('is announced as Paperlane, with the wordmark or the staff area', () => {
    const { unmount } = render(<BrandMark />);
    expect(screen.getByRole('link', { name: 'Paperlane' })).toHaveAttribute('href', '/');
    unmount();
    render(<BrandMark area="Admin" href="/admin" tone="dark" />);
    expect(screen.getByRole('link', { name: 'Paperlane Admin' })).toHaveAttribute('href', '/admin');
  });
});

describe('SiteHeader', () => {
  it('offers sign-in links that return to the current page', async () => {
    setPathname('/courses/abc');
    renderWithSession(<SiteHeader />);
    expect((await screen.findAllByRole('link', { name: 'Sign in' }))[0]).toHaveAttribute(
      'href',
      '/login?next=%2Fcourses%2Fabc',
    );
    expect(screen.getByRole('link', { name: 'Create account' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Teach with us' })).toHaveAttribute(
      'href',
      '/teach-with-us',
    );
  });

  it('does not send people back to a sign-in or sign-up page', async () => {
    setPathname('/register');
    renderWithSession(<SiteHeader />);
    expect((await screen.findAllByRole('link', { name: 'Sign in' }))[0]).toHaveAttribute(
      'href',
      '/login',
    );
    // On the sign-up page, "Create account" would point at the page you are already on.
    expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument();
  });

  it('links to each role’s area', async () => {
    renderWithSession(<SiteHeader />, { ...STUDENT, roles: ['STUDENT', 'TEACHER'] });
    expect(await screen.findByRole('link', { name: 'My learning' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'My teaching' })).toHaveAttribute(
      'href',
      '/teacher/courses',
    );
  });

  it('tells an admin without MFA to set it up', async () => {
    renderWithSession(<SiteHeader />, { ...STUDENT, roles: ['ADMIN'], mfaEnabled: false });
    expect(
      await screen.findByRole('region', { name: 'Two-step verification required' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set it up now' })).toHaveAttribute(
      'href',
      '/account/mfa',
    );
  });

  it('shows the signed-in user and signs out', async () => {
    apiMock.post.mockResolvedValue(null);
    renderWithSession(<SiteHeader />, { ...STUDENT, roles: ['STUDENT', 'TEACHER'] });
    expect(await screen.findByText('Ayesha Khan')).toBeVisible();
    expect(screen.getByText('Teacher')).toBeVisible();
    expect(screen.queryByText('Student')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/auth/logout', expect.anything()),
    );
    expect(router.push).toHaveBeenCalledWith('/courses');
    expect((await screen.findAllByRole('link', { name: 'Sign in' }))[0]).toBeVisible();
  });

  it('hides the shopping links from an admin-only account', async () => {
    renderWithSession(<SiteHeader />, { ...STUDENT, roles: ['ADMIN'], mfaEnabled: true });
    expect(await screen.findByRole('link', { name: 'Admin' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'My orders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Cart/ })).not.toBeInTheDocument();
  });

  it('keeps the links behind a Menu button that opens, closes and answers Escape', async () => {
    renderWithSession(<SiteHeader />, STUDENT);
    const menu = await screen.findByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveAttribute('aria-controls');
    expect(document.getElementById(menu.getAttribute('aria-controls') as string)).toContainElement(
      screen.getByRole('link', { name: 'My learning' }),
    );

    await userEvent.click(menu);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
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
