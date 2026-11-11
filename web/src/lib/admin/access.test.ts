import { describe, expect, it } from 'vitest';
import type { MeWithContext } from '@/lib/api/admin';
import { adminAccess, canSwitchContext } from './access';

const admin: MeWithContext = {
  id: 'a-1',
  email: 'admin@lms.local',
  fullName: 'Admin',
  isEmailVerified: true,
  roles: ['ADMIN'],
  mfaEnabled: true,
  mfaVerified: true,
  activeContext: null,
  availableContexts: [],
};

describe('adminAccess', () => {
  it('waits for the session, then asks anonymous visitors to sign in', () => {
    expect(adminAccess('loading', null)).toBe('loading');
    expect(adminAccess('signed-out', null)).toBe('signed-out');
  });

  it('refuses accounts without the ADMIN role', () => {
    expect(adminAccess('signed-in', { ...admin, roles: ['TEACHER'] })).toBe('not-admin');
    expect(adminAccess('signed-in', { ...admin, roles: ['STUDENT'] })).toBe('not-admin');
  });

  it('requires MFA enrolment and an MFA-verified session (#16)', () => {
    expect(adminAccess('signed-in', { ...admin, mfaEnabled: false })).toBe('mfa-setup');
    expect(adminAccess('signed-in', { ...admin, mfaVerified: false })).toBe('mfa-signin');
  });

  it('a dual-role account in the Teacher context is told to switch, never let through (#109)', () => {
    const dual = {
      ...admin,
      roles: ['ADMIN', 'TEACHER'] as MeWithContext['roles'],
      availableContexts: ['ADMIN', 'TEACHER'] as MeWithContext['availableContexts'],
    };
    expect(adminAccess('signed-in', { ...dual, activeContext: 'TEACHER' })).toBe('wrong-context');
    expect(adminAccess('signed-in', { ...dual, activeContext: 'ADMIN' })).toBe('ok');
    expect(canSwitchContext(dual)).toBe(true);
  });

  it('a single-role admin is let in and has nothing to switch', () => {
    expect(adminAccess('signed-in', admin)).toBe('ok');
    expect(canSwitchContext(admin)).toBe(false);
    expect(canSwitchContext(null)).toBe(false);
  });
});
