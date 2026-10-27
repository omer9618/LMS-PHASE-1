import {
  accessState,
  assertCourseEnrollable,
  assertRevocable,
  completionPercent,
  decideAdminGrant,
  decideFreeEnrollment,
  EnrollableCourseFacts,
  EnrollmentRefusedError,
  isEnrollmentActive,
} from './enrollment.rules';

const now = new Date('2026-10-27T12:00:00Z');
const course: EnrollableCourseFacts = {
  status: 'PUBLISHED',
  audienceType: 'STUDENT',
  isFree: true,
  isEnrollmentOpen: true,
  teacherId: 'teacher',
  teacherActive: true,
};

describe('access state (#51)', () => {
  it('active and perpetual, or active and not yet expired, grants access', () => {
    expect(isEnrollmentActive({ status: 'ACTIVE', expiresAt: null }, now)).toBe(true);
    expect(isEnrollmentActive({ status: 'ACTIVE', expiresAt: new Date('2026-10-28') }, now)).toBe(
      true,
    );
  });

  it('distinguishes expired (by date or status), revoked and none', () => {
    expect(accessState({ status: 'ACTIVE', expiresAt: now }, now)).toBe('EXPIRED');
    expect(accessState({ status: 'EXPIRED', expiresAt: null }, now)).toBe('EXPIRED');
    expect(accessState({ status: 'REVOKED', expiresAt: null }, now)).toBe('REVOKED');
    expect(accessState(null, now)).toBe('NONE');
  });
});

describe('course enrollability (#22, #32, #40)', () => {
  it.each([
    ['unpublished', { status: 'DRAFT' as const }, 'NOT_AVAILABLE'],
    ['archived', { status: 'ARCHIVED' as const }, 'NOT_AVAILABLE'],
    ['a PD course', { audienceType: 'TEACHER_PD' as const }, 'NOT_AVAILABLE'],
    ['from a suspended teacher', { teacherActive: false }, 'TEACHER_SUSPENDED'],
    ['closed to enrollment', { isEnrollmentOpen: false }, 'ENROLLMENT_CLOSED'],
  ])('refuses a course that is %s', (_label, change, reason) => {
    expect(() => assertCourseEnrollable({ ...course, ...change })).toThrow(
      expect.objectContaining({ info: { reason } }),
    );
  });
});

describe('free enrollment (#47)', () => {
  it('creates, reactivates an expired one, and is idempotent when already active', () => {
    expect(decideFreeEnrollment(course, 's', null, now)).toBe('CREATE');
    expect(decideFreeEnrollment(course, 's', { status: 'EXPIRED', expiresAt: null }, now)).toBe(
      'REACTIVATE',
    );
    expect(decideFreeEnrollment(course, 's', { status: 'ACTIVE', expiresAt: null }, now)).toBe(
      'ALREADY_ACTIVE',
    );
  });

  it('refuses paid courses, the teacher’s own course and revoked students', () => {
    expect(() => decideFreeEnrollment({ ...course, isFree: false }, 's', null, now)).toThrow(
      /Buy it/,
    );
    expect(() => decideFreeEnrollment(course, 'teacher', null, now)).toThrow(/You teach/);
    expect(() =>
      decideFreeEnrollment(course, 's', { status: 'REVOKED', expiresAt: null }, now),
    ).toThrow(/revoked/);
  });
});

describe('admin grant and revoke (#49)', () => {
  it('grants even when enrollment is closed, but not on unpublished courses or active students', () => {
    expect(decideAdminGrant({ ...course, isEnrollmentOpen: false }, null, now)).toBe('CREATE');
    expect(decideAdminGrant(course, { status: 'REVOKED', expiresAt: null }, now)).toBe(
      'REACTIVATE',
    );
    expect(() => decideAdminGrant({ ...course, status: 'DRAFT' }, null, now)).toThrow(
      EnrollmentRefusedError,
    );
    expect(() => decideAdminGrant(course, { status: 'ACTIVE', expiresAt: null }, now)).toThrow(
      /already has active access/,
    );
  });

  it('cannot revoke twice', () => {
    expect(() => assertRevocable({ status: 'REVOKED', expiresAt: null })).toThrow(
      EnrollmentRefusedError,
    );
    expect(() => assertRevocable({ status: 'ACTIVE', expiresAt: null })).not.toThrow();
  });
});

describe('completion percentage (#94)', () => {
  it.each([
    [0, 0, 0],
    [0, 10, 0],
    [1, 3, 33],
    [3, 3, 100],
    [5, 3, 100],
  ])('%i of %i lessons -> %i%%', (completed, total, expected) => {
    expect(completionPercent(completed, total)).toBe(expected);
  });
});
