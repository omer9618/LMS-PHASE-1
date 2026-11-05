import type { LearnerLesson, LearnerOutline } from './api/learn';

/** Every lesson in course order (section order, then lesson order). */
export function flattenLessons(outline: LearnerOutline): LearnerLesson[] {
  return outline.sections.flatMap((section) => section.lessons);
}

/**
 * The lesson to show: the one in the URL if it exists, else the API's "continue here" lesson,
 * else the first. A locked lesson can still be selected: it shows why it is locked.
 */
export function pickLesson(
  outline: LearnerOutline,
  requestedId: string | null,
): LearnerLesson | null {
  const lessons = flattenLessons(outline);
  return (
    lessons.find((l) => l.id === requestedId) ??
    lessons.find((l) => l.id === outline.currentLessonId) ??
    lessons[0] ??
    null
  );
}

const TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  TEXT: 'Reading',
  PDF: 'Document',
  QUIZ: 'Quiz',
};

export function lessonTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/** Screen-reader status for a lesson in the outline. */
export function lessonStatusLabel(lesson: LearnerLesson): string {
  if (lesson.state === 'COMPLETED') return 'completed';
  if (lesson.state === 'LOCKED') return lesson.lock ? `locked: ${lesson.lock.message}` : 'locked';
  return 'not started';
}
