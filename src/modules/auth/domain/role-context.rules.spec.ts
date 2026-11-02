import {
  checkRouteRoles,
  decideContextSwitch,
  DEFAULT_CONTEXT,
  effectiveRoles,
  isDualRole,
  resolveContext,
  RoleContextNotApplicableError,
  RoleValue,
} from './role-context.rules';

const set = (...roles: RoleValue[]) => new Set<RoleValue>(roles);
const dual = set('ADMIN', 'TEACHER');

describe('role context rules (#109)', () => {
  it('only ADMIN+TEACHER accounts are dual-role', () => {
    expect(isDualRole(dual)).toBe(true);
    expect(isDualRole(set('ADMIN', 'TEACHER', 'STUDENT'))).toBe(true);
    expect(isDualRole(set('ADMIN'))).toBe(false);
    expect(isDualRole(set('TEACHER', 'STUDENT'))).toBe(false);
  });

  describe('resolveContext', () => {
    it('defaults a dual-role session to ADMIN', () => {
      expect(DEFAULT_CONTEXT).toBe('ADMIN');
      expect(resolveContext(dual, null)).toBe('ADMIN');
      expect(resolveContext(dual, 'STUDENT')).toBe('ADMIN');
    });

    it('uses the stored context', () => {
      expect(resolveContext(dual, 'TEACHER')).toBe('TEACHER');
      expect(resolveContext(dual, 'ADMIN')).toBe('ADMIN');
    });

    it('is null for single-role accounts, whatever is stored', () => {
      expect(resolveContext(set('TEACHER'), 'ADMIN')).toBeNull();
      expect(resolveContext(set('ADMIN'), 'TEACHER')).toBeNull();
      expect(resolveContext(set('STUDENT'), null)).toBeNull();
    });
  });

  describe('effectiveRoles', () => {
    it('drops the inactive context role only', () => {
      expect(effectiveRoles(set('ADMIN', 'TEACHER', 'STUDENT'), 'ADMIN')).toEqual(
        set('ADMIN', 'STUDENT'),
      );
      expect(effectiveRoles(dual, 'TEACHER')).toEqual(set('TEACHER'));
    });

    it('keeps every role without a context', () => {
      expect(effectiveRoles(set('TEACHER', 'STUDENT'), null)).toEqual(set('TEACHER', 'STUDENT'));
    });
  });

  describe('decideContextSwitch', () => {
    it('switches a dual-role session and reports whether it changed', () => {
      expect(decideContextSwitch(dual, 'ADMIN', 'TEACHER')).toEqual({
        to: 'TEACHER',
        changed: true,
      });
      expect(decideContextSwitch(dual, 'TEACHER', 'TEACHER')).toEqual({
        to: 'TEACHER',
        changed: false,
      });
    });

    it('refuses single-role accounts', () => {
      expect(() => decideContextSwitch(set('TEACHER'), null, 'TEACHER')).toThrow(
        RoleContextNotApplicableError,
      );
      expect(() => decideContextSwitch(set('ADMIN'), null, 'TEACHER')).toThrow(
        RoleContextNotApplicableError,
      );
    });
  });

  describe('checkRouteRoles', () => {
    const admin = ['ADMIN'] as RoleValue[];
    const teacher = ['TEACHER'] as RoleValue[];

    it.each([
      ['ADMIN', admin, true, null],
      ['ADMIN', teacher, false, 'TEACHER'],
      ['TEACHER', teacher, true, null],
      ['TEACHER', admin, false, 'ADMIN'],
    ] as const)('dual-role in %s context on %j routes', (context, route, allowed, needed) => {
      const result = checkRouteRoles(route, effectiveRoles(dual, context), dual);
      expect(result.allowed).toBe(allowed);
      if (!result.allowed) expect(result.requiredContext).toBe(needed);
    });

    it('a route open to either role is allowed in both contexts', () => {
      const both = ['ADMIN', 'TEACHER'] as RoleValue[];
      expect(checkRouteRoles(both, effectiveRoles(dual, 'ADMIN'), dual).allowed).toBe(true);
      expect(checkRouteRoles(both, effectiveRoles(dual, 'TEACHER'), dual).allowed).toBe(true);
    });

    it('single-role accounts: allowed or plainly forbidden, never a context error', () => {
      const teacherOnly = set('TEACHER');
      expect(checkRouteRoles(teacher, teacherOnly, teacherOnly)).toEqual({ allowed: true });
      expect(checkRouteRoles(admin, teacherOnly, teacherOnly)).toEqual({
        allowed: false,
        requiredContext: null,
      });
    });
  });
});
