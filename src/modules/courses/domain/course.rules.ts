import { DomainError } from '../../../common/errors/domain.error';

/**
 * Course state machine (#25), publish guard (#29) and pricing invariants.
 * Pure: no Nest, no Prisma, no I/O. The service loads a course, asks these rules what the change
 * is, and persists the result.
 *
 * Mirrors the schema's CourseStatus enum exactly. Archival is status ARCHIVED + archived_at;
 * there is no is_archived flag.
 */
export type CourseStatusValue =
  'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';

export type CourseAction = 'SUBMIT' | 'APPROVE' | 'REJECT';

/**
 * The transitions implemented in this phase.
 * - REJECTED is final: a teacher cannot edit and resubmit a rejected course (decided 2026-10-23).
 * - PUBLISHED -> ARCHIVED and unpublish belong to #26 / #28 and are not built yet.
 */
export const COURSE_TRANSITIONS: Readonly<
  Record<CourseAction, { from: CourseStatusValue; to: CourseStatusValue }>
> = {
  SUBMIT: { from: 'DRAFT', to: 'PENDING_APPROVAL' },
  APPROVE: { from: 'PENDING_APPROVAL', to: 'PUBLISHED' },
  REJECT: { from: 'PENDING_APPROVAL', to: 'REJECTED' },
};

/** Pricing may be set only while the course is awaiting review (#29). */
export const PRICEABLE_STATUSES: readonly CourseStatusValue[] = ['PENDING_APPROVAL'];

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
    super(`Pricing can only be set while a course is awaiting approval (it is ${status})`, {
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
  return COURSE_TRANSITIONS[action].from === from;
}

export function nextStatus(from: CourseStatusValue, action: CourseAction): CourseStatusValue {
  if (!canTransition(from, action)) throw new InvalidCourseTransitionError(from, action);
  return COURSE_TRANSITIONS[action].to;
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
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new InvalidCourseInputError('A rejection reason is required');
  return { status, reason: trimmed };
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

/** Admin pricing (#29). A free course carries no price or commission. Records who and when. */
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
