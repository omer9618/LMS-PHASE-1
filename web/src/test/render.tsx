import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RequestError } from '@/lib/api/errors';
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
 * Renders inside a SessionProvider. GET /auth/me answers with `me` (signed out when null); any
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
    if (path === '/auth/me') {
      if (me) return me;
      throw new RequestError('UNAUTHENTICATED', {
        message: 'Authentication required',
        status: 401,
      });
    }
    return otherGets(path, query);
  });
  return render(<SessionProvider>{ui}</SessionProvider>);
}
