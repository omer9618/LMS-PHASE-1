import type { MeWithContext } from '@/lib/api/admin';
import type { SessionStatus } from '@/lib/session';

/**
 * Who may see the admin area, and what to show otherwise. Pure, so the gate is unit-tested.
 *
 * - `mfa-setup`: an admin must enrol in two-step verification first (#16).
 * - `mfa-signin`: enrolled, but this session did not pass the second step: sign in again.
 * - `wrong-context`: an Admin+Teacher account working in the Teacher context (#109). The admin
 *   area never switches it silently; the shell offers a labelled switch instead.
 */
export type AdminAccess =
  'loading' | 'signed-out' | 'not-admin' | 'mfa-setup' | 'mfa-signin' | 'wrong-context' | 'ok';

export function adminAccess(status: SessionStatus, user: MeWithContext | null): AdminAccess {
  if (status === 'loading') return 'loading';
  if (!user) return 'signed-out';
  if (!user.roles.includes('ADMIN')) return 'not-admin';
  if (!user.mfaEnabled) return 'mfa-setup';
  if (!user.mfaVerified) return 'mfa-signin';
  if (user.activeContext === 'TEACHER') return 'wrong-context';
  return 'ok';
}

/** Dual-role accounts (#109) can switch between the Admin and Teacher contexts. */
export function canSwitchContext(user: MeWithContext | null): boolean {
  return Boolean(user?.availableContexts && user.availableContexts.length > 1);
}
