import {
  AccountChangeRefusedError,
  AccountTarget,
  assertCanRevokeRole,
  decideStatusChange,
} from './user-admin.rules';

const teacher: AccountTarget = { id: 't', status: 'ACTIVE', roles: ['TEACHER'] };
const admin: AccountTarget = { id: 'a2', status: 'ACTIVE', roles: ['ADMIN'] };

describe('account status changes', () => {
  it('suspends, reactivates and deactivates along the allowed paths', () => {
    expect(decideStatusChange('a1', teacher, 'SUSPEND', 2)).toBe('SUSPENDED');
    expect(decideStatusChange('a1', { ...teacher, status: 'SUSPENDED' }, 'REACTIVATE', 2)).toBe(
      'ACTIVE',
    );
    expect(decideStatusChange('a1', { ...teacher, status: 'DELETED' }, 'REACTIVATE', 2)).toBe(
      'ACTIVE',
    );
    expect(decideStatusChange('a1', { ...teacher, status: 'SUSPENDED' }, 'DEACTIVATE', 2)).toBe(
      'DELETED',
    );
  });

  it.each([
    ['suspend a suspended account', { ...teacher, status: 'SUSPENDED' as const }, 'SUSPEND'],
    ['reactivate an active account', teacher, 'REACTIVATE'],
    ['deactivate a deactivated account', { ...teacher, status: 'DELETED' as const }, 'DEACTIVATE'],
  ] as const)('refuses to %s', (_label, target, action) => {
    expect(() => decideStatusChange('a1', target, action, 2)).toThrow(AccountChangeRefusedError);
  });

  it('refuses changes to your own account', () => {
    expect(() => decideStatusChange('t', teacher, 'SUSPEND', 2)).toThrow(/your own account/);
  });

  it('always keeps one active admin', () => {
    expect(() => decideStatusChange('a1', admin, 'SUSPEND', 1)).toThrow(
      /at least one active admin/,
    );
    expect(decideStatusChange('a1', admin, 'SUSPEND', 2)).toBe('SUSPENDED');
  });
});

describe('role revocation', () => {
  const dual: AccountTarget = { id: 'd', status: 'ACTIVE', roles: ['ADMIN', 'TEACHER'] };

  it('allows removing one role of several', () => {
    expect(() => assertCanRevokeRole('a1', dual, 'TEACHER', 2)).not.toThrow();
    expect(() => assertCanRevokeRole('a1', dual, 'ADMIN', 2)).not.toThrow();
  });

  it.each([
    ['a role the account lacks', 'a1', teacher, 'ADMIN', 2],
    ['the last role', 'a1', teacher, 'TEACHER', 2],
    ['your own admin role', 'd', dual, 'ADMIN', 2],
    ['the last active admin', 'a1', dual, 'ADMIN', 1],
  ] as const)('refuses to remove %s', (_label, actor, target, role, admins) => {
    expect(() => assertCanRevokeRole(actor, target, role, admins)).toThrow(
      AccountChangeRefusedError,
    );
  });
});
