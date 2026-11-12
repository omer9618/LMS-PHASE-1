import { describe, expect, it } from 'vitest';
import type { LearnerLesson, LearnerOutline } from '../api/learn';
import {
  curlyQuotes,
  flattenLessons,
  lessonStatusLabel,
  lessonTypeLabel,
  lessonsExplainingLock,
  pickLesson,
} from './outline';

function lesson(id: string, overrides: Partial<LearnerLesson> = {}): LearnerLesson {
  return {
    id,
    title: `Lesson ${id}`,
    type: 'VIDEO',
    isFreePreview: false,
    durationSeconds: null,
    isCheckpoint: false,
    passingScorePct: null,
    state: 'AVAILABLE',
    lock: null,
    completion: null,
    resumePositionSeconds: null,
    ...overrides,
  };
}

const outline: LearnerOutline = {
  courseId: 'c',
  title: 'Course',
  progressionMode: 'SEQUENTIAL',
  viewer: 'STUDENT',
  currentLessonId: 'b',
  completedLessons: 1,
  totalLessons: 3,
  completionPercent: 33,
  sections: [
    { id: 's1', title: 'One', lessons: [lesson('a', { state: 'COMPLETED' }), lesson('b')] },
    {
      id: 's2',
      title: 'Two',
      lessons: [
        lesson('c', {
          state: 'LOCKED',
          lock: {
            cause: 'PREVIOUS_LESSON_INCOMPLETE',
            blockingLessonId: 'b',
            blockingLessonTitle: 'Lesson b',
            message: 'Complete "Lesson b" to unlock this lesson',
          },
        }),
      ],
    },
  ],
};

describe('learner outline helpers', () => {
  it('flattens in course order', () => {
    expect(flattenLessons(outline).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('picks the requested lesson, else the current one, else the first', () => {
    expect(pickLesson(outline, 'c')?.id).toBe('c');
    expect(pickLesson(outline, 'nope')?.id).toBe('b');
    expect(pickLesson({ ...outline, currentLessonId: null }, null)?.id).toBe('a');
    expect(pickLesson({ ...outline, sections: [] }, null)).toBeNull();
  });

  it('labels types and states', () => {
    expect(lessonTypeLabel('TEXT')).toBe('Reading');
    expect(lessonTypeLabel('OTHER')).toBe('OTHER');
    const [a, b, c] = flattenLessons(outline);
    expect(lessonStatusLabel(a!)).toBe('completed');
    expect(lessonStatusLabel(b!)).toBe('not started');
    expect(lessonStatusLabel(c!)).toBe('locked');
  });

  it('says why a lesson is locked once per blocking lesson, not on every row', () => {
    const locked = (id: string, blocker: string) =>
      lesson(id, {
        state: 'LOCKED',
        lock: {
          cause: 'PREVIOUS_LESSON_INCOMPLETE',
          blockingLessonId: blocker,
          blockingLessonTitle: blocker,
          message: `Complete "${blocker}"`,
        },
      });
    const many = {
      ...outline,
      sections: [
        { id: 's', title: 'S', lessons: [locked('x1', 'q'), locked('x2', 'q'), locked('x3', 'r')] },
      ],
    };
    expect([...lessonsExplainingLock(many)]).toEqual(['x1', 'x3']);
  });

  it('writes straight quotes as curly ones', () => {
    expect(curlyQuotes('Complete "Topic 1.1" to unlock')).toBe('Complete “Topic 1.1” to unlock');
  });
});
