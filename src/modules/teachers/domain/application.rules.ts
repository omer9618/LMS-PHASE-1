import { DomainError } from '../../../common/errors/domain.error';

/**
 * Teacher application review (#20, #21, #23). Pure.
 * SUBMITTED -> UNDER_REVIEW -> REJECTED | HIRED; an admin may also decide straight from SUBMITTED.
 * REJECTED and HIRED are final. A rejected application is kept for the retention period, then
 * purged with its CV.
 */
export type ApplicationStatusValue = 'SUBMITTED' | 'UNDER_REVIEW' | 'REJECTED' | 'HIRED';

const TRANSITIONS: Record<ApplicationStatusValue, ApplicationStatusValue[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'HIRED'],
  UNDER_REVIEW: ['REJECTED', 'HIRED'],
  REJECTED: [],
  HIRED: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class InvalidApplicationTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(from: ApplicationStatusValue, to: ApplicationStatusValue) {
    super(`Cannot move an application from ${from} to ${to}`, {
      from,
      to,
      allowed: TRANSITIONS[from],
    });
  }
}

export interface ReviewDecision {
  status: ApplicationStatusValue;
  reviewedAt: Date;
  /** Set only for REJECTED: the date after which the application may be purged. */
  purgeAfter: Date | null;
}

export function decideReview(
  from: ApplicationStatusValue,
  to: ApplicationStatusValue,
  now: Date,
  retentionDays: number,
): ReviewDecision {
  if (!TRANSITIONS[from].includes(to)) throw new InvalidApplicationTransitionError(from, to);
  return {
    status: to,
    reviewedAt: now,
    purgeAfter: to === 'REJECTED' ? purgeDate(now, retentionDays) : null,
  };
}

/** Linking an account to an application hires the applicant (#21). */
export function decideLink(from: ApplicationStatusValue, now: Date): ReviewDecision {
  if (from === 'HIRED') return { status: 'HIRED', reviewedAt: now, purgeAfter: null };
  return decideReview(from, 'HIRED', now, 0);
}

/** UTC calendar date `retentionDays` after `now` (purge_after is a DATE column). */
export function purgeDate(now: Date, retentionDays: number): Date {
  const date = new Date(now.getTime() + retentionDays * DAY_MS);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
