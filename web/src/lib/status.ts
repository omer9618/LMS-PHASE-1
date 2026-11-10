import type { BadgeTone } from '@/components/ui';

/**
 * The tone of every status the API returns, in one place (Exam Hall status chips: a signal is a
 * tint plus words, never colour alone). A screen whose meaning differs passes its own `tones`.
 *
 *   courses  DRAFT neutral · IN REVIEW info · PUBLISHED success · REJECTED danger · ARCHIVED neutral
 *   orders   AWAITING PAYMENT warning · PROOF SUBMITTED info · CONFIRMED success ·
 *            REJECTED and EXPIRED danger
 */
export const STATUS_TONES: Record<string, BadgeTone> = {
  // good
  ACTIVE: 'success',
  PUBLISHED: 'success',
  VERIFIED: 'success',
  HIRED: 'success',
  ACCEPTED: 'success',
  RESOLVED: 'success',
  // waiting on the person looking at it
  PROOF_SUBMITTED: 'info',
  PENDING_APPROVAL: 'info',
  UNDER_REVIEW: 'info',
  SUBMITTED: 'info',
  // waiting on someone else, or needs a look
  PENDING: 'warning',
  OPEN: 'warning',
  DISPUTED: 'warning',
  // at rest
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
  REFUNDED: 'neutral',
  // bad
  EXPIRED: 'danger',
  LAPSED: 'danger',
  SUSPENDED: 'danger',
  DELETED: 'danger',
  REJECTED: 'danger',
  REVOKED: 'danger',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}
