import type { Role } from '@prisma/client';
import type { AuthUser } from '../../src/common/auth/auth-user';

/** An AuthUser for unit tests. */
export function fakeUser(id: string, ...roles: Role[]): AuthUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: `User ${id}`,
    isEmailVerified: true,
    roles: new Set(roles),
    sessionId: 'session',
  };
}
