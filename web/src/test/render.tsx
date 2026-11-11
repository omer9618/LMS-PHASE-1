import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Me } from '@/lib/api/schemas/auth';
import { SessionProvider } from '@/lib/session';
import { apiMock } from './mocks';

export const STUDENT: Me = {
  id: 'u-1',
  email: 'ayesha@example.com',
  fullName: 'Ayesha Khan',
  isEmailVerified: true,
  roles: ['STUDENT'],
  mfaEnabled: false,
  mfaVerified: false,
};

/**
 * Renders inside a SessionProvider. GET /auth/session answers with `me` (signed out when null); any
 * other GET goes to `otherGets`.
 */
export function renderWithSession(
  ui: ReactElement,
  me: Me | null = null,
  otherGets: (path: string, query?: unknown) => unknown = () => {
    throw new Error('unexpected GET');
  },
): RenderResult {
  apiMock.get.mockImplementation(async (path: string, query?: unknown) => {
    if (path === '/auth/session') return { user: me };
    return otherGets(path, query);
  });
  return render(<SessionProvider>{ui}</SessionProvider>);
}
