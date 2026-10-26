import {
  CourseStatusValue,
  decideLessonAccess,
  decideResourceAccess,
  LessonAccessFacts,
  nextVideoStatus,
  videoStatusFromBunnyApi,
  videoStatusFromBunnyWebhook,
} from './video.rules';

describe('Bunny status mapping', () => {
  it.each([
    [0, 'PROCESSING'],
    [1, 'PROCESSING'],
    [2, 'PROCESSING'],
    [3, 'PROCESSING'],
    [4, 'READY'],
    [5, 'FAILED'],
    [6, 'FAILED'],
    [7, 'PROCESSING'],
    [8, 'PROCESSING'],
  ])('API status %i -> %s', (status, expected) => {
    expect(videoStatusFromBunnyApi(status)).toBe(expected);
  });

  it.each([
    [0, 'PROCESSING'],
    [2, 'PROCESSING'],
    [3, 'READY'],
    [4, 'READY'],
    [5, 'FAILED'],
    [8, 'FAILED'],
    [9, null],
    [10, null],
  ])('webhook status %i -> %s', (status, expected) => {
    expect(videoStatusFromBunnyWebhook(status)).toBe(expected);
  });

  it('never moves a ready video back to processing', () => {
    expect(nextVideoStatus('READY', 'PROCESSING')).toBe('READY');
    expect(nextVideoStatus('PROCESSING', 'READY')).toBe('READY');
    expect(nextVideoStatus('READY', 'FAILED')).toBe('FAILED');
  });
});

describe('lesson access (#37, #39)', () => {
  const base: LessonAccessFacts = {
    courseStatus: 'PUBLISHED',
    isFreePreview: false,
    isCourseTeacher: false,
    isAdmin: false,
    hasActiveEnrollment: false,
  };

  it('staff always have access, in any status', () => {
    const statuses: CourseStatusValue[] = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'];
    statuses.forEach((courseStatus) => {
      expect(decideLessonAccess({ ...base, courseStatus, isCourseTeacher: true }).allowed).toBe(
        true,
      );
      expect(decideLessonAccess({ ...base, courseStatus, isAdmin: true }).allowed).toBe(true);
    });
  });

  it('enrolled students have access while published, and keep it when archived', () => {
    expect(decideLessonAccess({ ...base, hasActiveEnrollment: true })).toEqual({
      allowed: true,
      via: 'ENROLLMENT',
    });
    expect(
      decideLessonAccess({ ...base, courseStatus: 'ARCHIVED', hasActiveEnrollment: true }).allowed,
    ).toBe(true);
    expect(
      decideLessonAccess({ ...base, courseStatus: 'DRAFT', hasActiveEnrollment: true }),
    ).toEqual({ allowed: false, reason: 'NOT_AVAILABLE' });
  });

  it('free previews are public only on a published course', () => {
    expect(decideLessonAccess({ ...base, isFreePreview: true })).toEqual({
      allowed: true,
      via: 'FREE_PREVIEW',
    });
    expect(
      decideLessonAccess({ ...base, courseStatus: 'ARCHIVED', isFreePreview: true }).allowed,
    ).toBe(false);
    expect(decideLessonAccess(base)).toEqual({ allowed: false, reason: 'NOT_ENROLLED' });
  });

  it('resources need an enrollment even on free-preview lessons', () => {
    expect(decideResourceAccess({ ...base, isFreePreview: true }).allowed).toBe(false);
    expect(decideResourceAccess({ ...base, hasActiveEnrollment: true }).allowed).toBe(true);
  });
});
