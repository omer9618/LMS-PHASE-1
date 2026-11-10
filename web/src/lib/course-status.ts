import type { BadgeTone } from '@/components/ui';
import { statusTone } from './status';
import type { CourseStatus } from './api/schemas/enrollment';

/** Mirrors the API's course rules (src/modules/courses/domain/course.rules.ts). */
export const COURSE_STATUS: Record<CourseStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: statusTone('DRAFT') },
  PENDING_APPROVAL: { label: 'In review', tone: statusTone('PENDING_APPROVAL') },
  PUBLISHED: { label: 'Published', tone: statusTone('PUBLISHED') },
  REJECTED: { label: 'Rejected', tone: statusTone('REJECTED') },
  ARCHIVED: { label: 'Archived', tone: statusTone('ARCHIVED') },
};

/** Teachers edit details only while drafting; published details are locked (decided 2026-10-26). */
export function detailsEditable(status: CourseStatus): boolean {
  return status === 'DRAFT';
}

/** Sections, lessons and files: while drafting and after publication, not in review. */
export function contentEditable(status: CourseStatus): boolean {
  return status === 'DRAFT' || status === 'PUBLISHED';
}

export function canSubmit(status: CourseStatus): boolean {
  return status === 'DRAFT';
}

export function canArchive(status: CourseStatus): boolean {
  return status === 'DRAFT' || status === 'PUBLISHED' || status === 'REJECTED';
}

/** Why the details are read-only, in the teacher's words. */
export function detailsLockReason(status: CourseStatus): string | null {
  switch (status) {
    case 'DRAFT':
      return null;
    case 'PENDING_APPROVAL':
      return 'The course is in review, so its details cannot change until an admin decides.';
    case 'PUBLISHED':
      return 'Details of a published course are locked. Ask an admin to change them. You can still edit the content.';
    case 'REJECTED':
      return 'This course was rejected. Rejection is final, so it cannot be edited or resubmitted.';
    case 'ARCHIVED':
      return 'This course is archived. Enrolled students keep access; nothing can be edited.';
  }
}
