import { DomainError } from '../../../common/errors/domain.error';

/**
 * Course outline rules (#27): ordering of sections and lessons, and what a lesson needs.
 * Pure. Positions are dense, 0-based `order_index` values within their parent.
 */
export type LessonTypeValue = 'VIDEO' | 'PDF' | 'TEXT' | 'QUIZ';

export class InvalidOrderError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export class OutlineChangeRefusedError extends DomainError {
  readonly code = 'COURSE_LOCKED';
}

/**
 * Validates a full reorder: the request must name exactly the current items, once each.
 * Returns id -> new position.
 */
export function planReorder(currentIds: string[], requestedIds: string[]): Map<string, number> {
  const current = new Set(currentIds);
  const requested = new Set(requestedIds);
  const sameSet =
    requested.size === requestedIds.length &&
    requested.size === current.size &&
    [...requested].every((id) => current.has(id));
  if (!sameSet) {
    throw new InvalidOrderError('The new order must list every item exactly once', {
      expected: currentIds.length,
      received: requestedIds.length,
    });
  }
  return new Map(requestedIds.map((id, index) => [id, index]));
}

/**
 * Moving a lesson within or between sections: returns the new order of both parents.
 * `position` is clamped to the end of the target.
 */
export function planMove(
  lessonId: string,
  source: string[],
  target: string[] | null,
  position: number,
): { source: string[]; target: string[] | null } {
  if (!source.includes(lessonId)) {
    throw new InvalidOrderError('The lesson is not in the given section');
  }
  const withoutLesson = source.filter((id) => id !== lessonId);
  const destination = target ?? withoutLesson;
  const at = Math.max(0, Math.min(position, destination.length));
  const moved = [...destination.slice(0, at), lessonId, ...destination.slice(at)];
  return target === null
    ? { source: moved, target: null }
    : { source: withoutLesson, target: moved };
}

/** A TEXT lesson needs its body; other types get their content attached separately. */
export function assertLessonContent(
  type: LessonTypeValue,
  bodyText: string | null | undefined,
): void {
  if (type === 'TEXT' && !bodyText?.trim()) {
    throw new InvalidOrderError('A text lesson needs body text', { field: 'bodyText' });
  }
}

/** Student work is never deleted silently: lessons with progress or attempts cannot be removed. */
export function assertLessonDeletable(activity: { progress: number; attempts: number }): void {
  if (activity.progress > 0 || activity.attempts > 0) {
    throw new OutlineChangeRefusedError(
      'Students have progress or quiz attempts on this lesson, so it cannot be deleted. Hide it by moving it, or edit it instead.',
      activity,
    );
  }
}

export function assertSectionDeletable(lessonCount: number): void {
  if (lessonCount > 0) {
    throw new OutlineChangeRefusedError('Move or delete the lessons in this section first', {
      lessons: lessonCount,
    });
  }
}
