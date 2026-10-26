/**
 * Enrollment rules (#46, #51). Pure.
 */
export type EnrollmentStatusValue = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/** An enrollment grants access while ACTIVE and not past its (optional) expiry. */
export function isEnrollmentActive(
  enrollment: { status: EnrollmentStatusValue; expiresAt: Date | null },
  now: Date,
): boolean {
  if (enrollment.status !== 'ACTIVE') return false;
  return enrollment.expiresAt === null || enrollment.expiresAt.getTime() > now.getTime();
}
