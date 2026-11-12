import type { LearnerLesson, LearnerOutline } from '../api/learn';

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

/** Screen-reader status for a lesson in the outline (the reason, when shown, is in the text). */
export function lessonStatusLabel(lesson: LearnerLesson): string {
  if (lesson.state === 'COMPLETED') return 'completed';
  if (lesson.state === 'LOCKED') return 'locked';
  return 'not started';
}

/** "Complete "Topic 1.1" to unlock" → curly quotes, like the rest of the page's text. */
export function curlyQuotes(text: string): string {
  return text.replace(/"([^"]+)"/g, '“$1”');
}

/**
 * The locked lessons that should say why: the first one, and any whose blocking lesson differs
 * from the locked lesson before it. Twenty rows that all wait on the same lesson say it once.
 */
export function lessonsExplainingLock(outline: LearnerOutline): Set<string> {
  const explain = new Set<string>();
  let lastBlocking: string | null = null;
  for (const lesson of flattenLessons(outline)) {
    if (lesson.state !== 'LOCKED' || !lesson.lock) continue;
    if (lesson.lock.blockingLessonId !== lastBlocking) explain.add(lesson.id);
    lastBlocking = lesson.lock.blockingLessonId;
  }
  return explain;
}
