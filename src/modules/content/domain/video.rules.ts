/**
 * Video processing states and lesson access (#35–#37, #39). Pure.
 */
export type VideoStatusValue = 'PROCESSING' | 'READY' | 'FAILED';

/**
 * Bunny Stream "Get Video" `status` (API enum, bunny.net/docs/reference/video_getvideo):
 * 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed,
 * 7 JitSegmenting, 8 JitPlaylistsCreated.
 */
export function videoStatusFromBunnyApi(status: number): VideoStatusValue {
  if (status === 4) return 'READY';
  if (status === 5 || status === 6) return 'FAILED';
  return 'PROCESSING';
}

/**
 * Bunny Stream webhook `Status` (a different enum, bunny.net/docs/stream-webhook):
 * 0 Queued, 1 Processing, 2 Encoding, 3 Finished, 4 ResolutionFinished (playable),
 * 5 Failed, 6 PresignedUploadStarted, 7 PresignedUploadFinished, 8 PresignedUploadFailed,
 * 9 CaptionsGenerated, 10 TitleOrDescriptionGenerated.
 * Returns null for events that don't change playability.
 */
export function videoStatusFromBunnyWebhook(status: number): VideoStatusValue | null {
  if (status === 3 || status === 4) return 'READY';
  if (status === 5 || status === 8) return 'FAILED';
  if (status === 0 || status === 1 || status === 2 || status === 6 || status === 7) {
    return 'PROCESSING';
  }
  return null;
}

/** Statuses only move forward: a late PROCESSING event never un-readies a video. */
export function nextVideoStatus(
  current: VideoStatusValue,
  incoming: VideoStatusValue,
): VideoStatusValue {
  if (current === 'READY' && incoming === 'PROCESSING') return 'READY';
  return incoming;
}

export type CourseStatusValue =
  'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';

export interface LessonAccessFacts {
  courseStatus: CourseStatusValue;
  isFreePreview: boolean;
  isCourseTeacher: boolean;
  isAdmin: boolean;
  hasActiveEnrollment: boolean;
}

export type LessonAccessDecision =
  | { allowed: true; via: 'STAFF' | 'ENROLLMENT' | 'FREE_PREVIEW' }
  | { allowed: false; reason: 'NOT_ENROLLED' | 'NOT_AVAILABLE' };

/**
 * Who may play a lesson's video (#37, #39, #34):
 * - the course's teacher and admins, always (authoring and review);
 * - students with an active enrollment, while the course is published or archived (archiving
 *   keeps existing students' access, decided 2026-10-26);
 * - anyone, for free-preview lessons of a published course (the demo).
 */
export function decideLessonAccess(facts: LessonAccessFacts): LessonAccessDecision {
  if (facts.isCourseTeacher || facts.isAdmin) return { allowed: true, via: 'STAFF' };
  const live = facts.courseStatus === 'PUBLISHED' || facts.courseStatus === 'ARCHIVED';
  if (facts.hasActiveEnrollment && live) return { allowed: true, via: 'ENROLLMENT' };
  if (facts.isFreePreview && facts.courseStatus === 'PUBLISHED') {
    return { allowed: true, via: 'FREE_PREVIEW' };
  }
  return { allowed: false, reason: live ? 'NOT_ENROLLED' : 'NOT_AVAILABLE' };
}

/**
 * Resources (#39) are stricter: only enrolled students and staff, free preview or not.
 */
export function decideResourceAccess(facts: LessonAccessFacts): LessonAccessDecision {
  return decideLessonAccess({ ...facts, isFreePreview: false });
}
