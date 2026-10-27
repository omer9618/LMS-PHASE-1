import { DomainError } from '../../../common/errors/domain.error';

/**
 * Enrollment rules (#46–#52). Pure.
 * One row per student per course (unique); re-granting reuses it, so history lives in audit_log.
 */
export type EnrollmentStatusValue = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type EnrollmentSourceValue = 'PURCHASE' | 'FREE' | 'ADMIN_GRANT';
export type AccessState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NONE';

export interface EnrollmentState {
  status: EnrollmentStatusValue;
  expiresAt: Date | null;
}

/** An enrollment grants access while ACTIVE and not past its (optional) expiry (#51). */
export function isEnrollmentActive(enrollment: EnrollmentState, now: Date): boolean {
  return accessState(enrollment, now) === 'ACTIVE';
}

export function accessState(enrollment: EnrollmentState | null, now: Date): AccessState {
  if (!enrollment) return 'NONE';
  if (enrollment.status === 'REVOKED') return 'REVOKED';
  if (enrollment.status === 'EXPIRED') return 'EXPIRED';
  if (enrollment.expiresAt !== null && enrollment.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

export class EnrollmentRefusedError extends DomainError {
  readonly code = 'ENROLLMENT_REFUSED';
}

/** What a course must be for anyone to enroll (catalogue facts, #22, #32, #40). */
export interface EnrollableCourseFacts {
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  audienceType: 'STUDENT' | 'TEACHER_PD';
  isFree: boolean;
  isEnrollmentOpen: boolean;
  teacherId: string;
  teacherActive: boolean;
}

/** Whether the course itself accepts new enrollments right now. */
export function assertCourseEnrollable(course: EnrollableCourseFacts): void {
  if (course.status !== 'PUBLISHED' || course.audienceType !== 'STUDENT') {
    throw new EnrollmentRefusedError('This course is not available for enrollment', {
      reason: 'NOT_AVAILABLE',
    });
  }
  if (!course.teacherActive) {
    throw new EnrollmentRefusedError('This course is not taking new enrollments', {
      reason: 'TEACHER_SUSPENDED',
    });
  }
  if (!course.isEnrollmentOpen) {
    throw new EnrollmentRefusedError('Enrollment for this course is closed', {
      reason: 'ENROLLMENT_CLOSED',
    });
  }
}

/**
 * #47: free direct enrollment. Returns whether to create, reactivate, or that the student already
 * has access (idempotent: enrolling twice is not an error).
 */
export function decideFreeEnrollment(
  course: EnrollableCourseFacts,
  studentId: string,
  existing: EnrollmentState | null,
  now: Date,
): 'CREATE' | 'REACTIVATE' | 'ALREADY_ACTIVE' {
  if (course.teacherId === studentId) {
    throw new EnrollmentRefusedError('You teach this course', { reason: 'OWN_COURSE' });
  }
  if (!course.isFree) {
    throw new EnrollmentRefusedError('This is a paid course. Buy it to enroll.', {
      reason: 'PAID_COURSE',
    });
  }
  const state = accessState(existing, now);
  if (state === 'ACTIVE') return 'ALREADY_ACTIVE';
  if (state === 'REVOKED') {
    throw new EnrollmentRefusedError('Your access to this course was revoked. Contact support.', {
      reason: 'REVOKED',
    });
  }
  assertCourseEnrollable(course);
  return existing ? 'REACTIVATE' : 'CREATE';
}

/**
 * #49: admin grant against an offline payment. Admins may grant even when enrollment is closed,
 * but only for a live student course. An already-active enrollment is refused (nothing to grant).
 */
export function decideAdminGrant(
  course: EnrollableCourseFacts,
  existing: EnrollmentState | null,
  now: Date,
): 'CREATE' | 'REACTIVATE' {
  if (course.status !== 'PUBLISHED' || course.audienceType !== 'STUDENT') {
    throw new EnrollmentRefusedError('Only published student courses can be granted', {
      reason: 'NOT_AVAILABLE',
    });
  }
  if (accessState(existing, now) === 'ACTIVE') {
    throw new EnrollmentRefusedError('The student already has active access to this course', {
      reason: 'ALREADY_ACTIVE',
    });
  }
  return existing ? 'REACTIVATE' : 'CREATE';
}

export function assertRevocable(existing: EnrollmentState): void {
  if (existing.status === 'REVOKED') {
    throw new EnrollmentRefusedError('This enrollment is already revoked', {
      reason: 'ALREADY_REVOKED',
    });
  }
}

/** #94: completed lessons over total, as a whole percentage. An empty course is 0%. */
export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((completed / total) * 100));
}
