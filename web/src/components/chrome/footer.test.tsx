import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMocks } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { SiteFooter } from './SiteFooter';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

beforeEach(() => {
  resetMocks();
});

describe('SiteFooter', () => {
  it('offers sign-in to a visitor', async () => {
    renderWithSession(<SiteFooter />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('offers the account page, not sign-in, once signed in', async () => {
    renderWithSession(<SiteFooter />, STUDENT);
    expect(await screen.findByRole('link', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
