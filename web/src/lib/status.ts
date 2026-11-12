import type { BadgeTone } from '@/components/ui';
import { humanize } from './format';

/**
 * The tone of every status the API returns, in one place (Paperlane status chips: a signal is a
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

/**
 * The words for a status, the same on every screen and for every role. Only the statuses whose
 * plain wording differs from "Pending approval"-style humanising are listed.
 *
 *   orders   Awaiting payment · Proof submitted · Confirmed · Rejected · Expired
 *   courses  Draft · In review · Published · Rejected · Archived
 *   payouts  Pending · Accepted · Concern raised · Resolved
 */
export const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'In review',
  PROOF_SUBMITTED: 'Proof submitted',
  VERIFIED: 'Confirmed',
  DISPUTED: 'Concern raised',
  LAPSED: 'Expired',
};

/** Orders: PENDING is "Awaiting payment" here, though payouts use the same word for something else. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  PENDING: 'Awaiting payment',
};

export function statusLabel(
  status: string,
  labels: Record<string, string> = STATUS_LABELS,
): string {
  return labels[status] ?? humanize(status);
}
