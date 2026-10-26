import { DomainError } from '../../../common/errors/domain.error';

/**
 * Course state machine (#25), publish guard (#29), editing and pricing rules (#26, #31).
 * Pure: no Nest, no Prisma, no I/O. The service loads a course, asks these rules what the change
 * is, and persists the result.
 *
 * Mirrors the schema's CourseStatus enum exactly. Archival is status ARCHIVED + archived_at;
 * there is no is_archived flag.
 */
export type CourseStatusValue =
  'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';

export type CourseAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'UNPUBLISH' | 'ARCHIVE';

/**
 * Every allowed transition. Decisions recorded 2026-10-23/26:
 * - REJECTED is final: no edit-and-resubmit.
 * - UNPUBLISH (admin, with reason) returns a published course to DRAFT for fixing and resubmission.
 * - ARCHIVE hides a course and closes enrollment; enrolled students keep access.
 */
export const COURSE_TRANSITIONS: Readonly<
  Record<CourseAction, { from: readonly CourseStatusValue[]; to: CourseStatusValue }>
> = {
  SUBMIT: { from: ['DRAFT'], to: 'PENDING_APPROVAL' },
  APPROVE: { from: ['PENDING_APPROVAL'], to: 'PUBLISHED' },
  REJECT: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
  UNPUBLISH: { from: ['PUBLISHED'], to: 'DRAFT' },
  ARCHIVE: { from: ['DRAFT', 'PUBLISHED', 'REJECTED'], to: 'ARCHIVED' },
};

/** Pricing (#29) while awaiting review, and changes after publication (#31). */
export const PRICEABLE_STATUSES: readonly CourseStatusValue[] = ['PENDING_APPROVAL', 'PUBLISHED'];

export type Editor = 'TEACHER' | 'ADMIN';

/**
 * Who may change a course's details (title, description, classification, modes) in which status.
 * Published details are locked for the teacher but an admin can still correct them (decided
 * 2026-10-26).
 */
const DETAILS_EDITABLE: Record<Editor, readonly CourseStatusValue[]> = {
  TEACHER: ['DRAFT'],
  ADMIN: ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED'],
};

/** Sections, lessons and resources: editable while drafting and after publication, not in review. */
export const CONTENT_EDITABLE_STATUSES: readonly CourseStatusValue[] = ['DRAFT', 'PUBLISHED'];

export const MAX_COMMISSION_BPS = 10_000;

// ── Errors ──────────────────────────────────────────────────────────

export class InvalidCourseTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(from: CourseStatusValue, action: CourseAction) {
    super(`Cannot ${action.toLowerCase()} a course that is ${from}`, {
      from,
      action,
      allowedFrom: COURSE_TRANSITIONS[action].from,
    });
  }
}

export class CourseLockedError extends DomainError {
  readonly code = 'COURSE_LOCKED';
}

export class CourseIncompleteError extends DomainError {
  readonly code = 'COURSE_INCOMPLETE';
}

export class PublishGuardError extends DomainError {
  readonly code = 'PUBLISH_GUARD_FAILED';

  constructor(missing: string[]) {
    super('A course must be free, or have both a price and a commission, before it is published', {
      missing,
    });
  }
}

export class CourseNotPriceableError extends DomainError {
  readonly code = 'COURSE_NOT_PRICEABLE';

  constructor(status: CourseStatusValue) {
    super(`Pricing can only be set on a course awaiting approval or published (it is ${status})`, {
      status,
      allowedStatuses: PRICEABLE_STATUSES,
    });
  }
}

export class InvalidCourseInputError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

// ── Transitions ─────────────────────────────────────────────────────

export function canTransition(from: CourseStatusValue, action: CourseAction): boolean {
  return COURSE_TRANSITIONS[action].from.includes(from);
}

export function nextStatus(from: CourseStatusValue, action: CourseAction): CourseStatusValue {
  if (!canTransition(from, action)) throw new InvalidCourseTransitionError(from, action);
  return COURSE_TRANSITIONS[action].to;
}

// ── Editing ─────────────────────────────────────────────────────────

export function assertDetailsEditable(status: CourseStatusValue, editor: Editor): void {
  if (!DETAILS_EDITABLE[editor].includes(status)) {
    throw new CourseLockedError(
      editor === 'TEACHER' && status === 'PUBLISHED'
        ? 'Details of a published course are locked. Ask an admin to change them.'
        : `Course details cannot be edited while the course is ${status}`,
      { status, editableIn: DETAILS_EDITABLE[editor] },
    );
  }
}

export function assertContentEditable(status: CourseStatusValue): void {
  if (!CONTENT_EDITABLE_STATUSES.includes(status)) {
    throw new CourseLockedError(`Course content cannot be edited while the course is ${status}`, {
      status,
      editableIn: CONTENT_EDITABLE_STATUSES,
    });
  }
}

/** #26: hard delete is refused once anyone has enrolled in or ordered the course. */
export function assertDeletable(related: { enrollments: number; orderItems: number }): void {
  if (related.enrollments > 0 || related.orderItems > 0) {
    throw new CourseLockedError(
      'This course has enrollments or orders and cannot be deleted. Archive it instead.',
      related,
    );
  }
}

/**
 * #34: every course carries a demo visible before enrollment. The demo is the course's own
 * free-preview video lessons (decided 2026-10-26), so at least one is required to submit.
 */
export function assertSubmittable(content: { freePreviewVideoLessons: number }): void {
  if (content.freePreviewVideoLessons < 1) {
    throw new CourseIncompleteError(
      'Mark at least one video lesson as a free preview: it is the demo students see before enrolling.',
      { missing: ['freePreviewVideoLesson'] },
    );
  }
}

// ── Publish guard ───────────────────────────────────────────────────

export interface CoursePricing {
  isFree: boolean;
  priceMinor: bigint | null;
  commissionRateBps: number | null;
}

/** Mirrors the courses_publish_guard CHECK constraint, so the user gets a clear error first. */
export function publishGuardMissing(course: CoursePricing): string[] {
  if (course.isFree) return [];
  const missing: string[] = [];
  if (course.priceMinor === null) missing.push('priceMinor');
  if (course.commissionRateBps === null) missing.push('commissionRateBps');
  return missing;
}

export function assertPublishable(course: CoursePricing): void {
  const missing = publishGuardMissing(course);
  if (missing.length > 0) throw new PublishGuardError(missing);
}

// ── Decisions (what the service persists) ───────────────────────────

export interface CourseForDecision extends CoursePricing {
  status: CourseStatusValue;
}

export function decideSubmission(
  course: Pick<CourseForDecision, 'status'>,
  teacherProposedBps?: number,
): { status: CourseStatusValue; teacherProposedBps?: number } {
  const status = nextStatus(course.status, 'SUBMIT');
  if (teacherProposedBps !== undefined) assertValidCommission(teacherProposedBps);
  return teacherProposedBps === undefined ? { status } : { status, teacherProposedBps };
}

export function decideApproval(
  course: CourseForDecision,
  now: Date,
): { status: CourseStatusValue; publishedAt: Date } {
  const status = nextStatus(course.status, 'APPROVE');
  assertPublishable(course);
  return { status, publishedAt: now };
}

export function decideRejection(
  course: Pick<CourseForDecision, 'status'>,
  reason: string,
): { status: CourseStatusValue; reason: string } {
  const status = nextStatus(course.status, 'REJECT');
  return { status, reason: requireReason(reason, 'rejection') };
}

/** #28: back to DRAFT, off the catalogue; enrolled students keep access. */
export function decideUnpublish(
  course: Pick<CourseForDecision, 'status'>,
  reason: string,
): { status: CourseStatusValue; reason: string; publishedAt: null } {
  const status = nextStatus(course.status, 'UNPUBLISH');
  return { status, reason: requireReason(reason, 'unpublish'), publishedAt: null };
}

/** #26: archived courses are hidden and closed to new enrollments; existing students keep access. */
export function decideArchive(
  course: Pick<CourseForDecision, 'status'>,
  now: Date,
): { status: CourseStatusValue; archivedAt: Date; isEnrollmentOpen: false } {
  const status = nextStatus(course.status, 'ARCHIVE');
  return { status, archivedAt: now, isEnrollmentOpen: false };
}

export type PricingInput =
  | { isFree: true }
  | { isFree: false; priceMinor: bigint; currency: string; commissionRateBps: number };

export interface PricingDecision {
  isFree: boolean;
  priceMinor: bigint | null;
  currency: string | null;
  commissionRateBps: number | null;
  pricedById: string;
  pricedAt: Date;
}

/**
 * Admin pricing (#29) and post-publication changes (#31). A free course carries no price or
 * commission. Records who and when. Existing orders keep their own snapshot (order_items), so a
 * change here only affects later sales.
 */
export function decidePricing(
  course: Pick<CourseForDecision, 'status'>,
  input: PricingInput,
  adminId: string,
  now: Date,
): PricingDecision {
  if (!PRICEABLE_STATUSES.includes(course.status)) {
    throw new CourseNotPriceableError(course.status);
  }
  if (input.isFree) {
    return {
      isFree: true,
      priceMinor: null,
      currency: null,
      commissionRateBps: null,
      pricedById: adminId,
      pricedAt: now,
    };
  }
  if (input.priceMinor <= 0n) {
    throw new InvalidCourseInputError('A paid course must have a price above zero', {
      field: 'priceMinor',
    });
  }
  assertValidCommission(input.commissionRateBps);
  return {
    isFree: false,
    priceMinor: input.priceMinor,
    currency: input.currency,
    commissionRateBps: input.commissionRateBps,
    pricedById: adminId,
    pricedAt: now,
  };
}

function requireReason(reason: string, what: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new InvalidCourseInputError(`A ${what} reason is required`);
  return trimmed;
}

function assertValidCommission(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_COMMISSION_BPS) {
    throw new InvalidCourseInputError(
      'Commission must be a whole number of basis points, 0 to 10000',
      {
        field: 'commissionRateBps',
      },
    );
  }
}
