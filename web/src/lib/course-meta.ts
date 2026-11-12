import type { CourseDetail } from './api/schemas/catalogue';

const DESCRIPTION_LENGTH = 160;

/** The summary shown in search results and link previews. */
export function courseDescription(course: CourseDetail): string {
  const own = course.description?.replace(/\s+/g, ' ').trim();
  const text =
    own && own.length > 0
      ? own
      : `${course.subject.name} for ${course.board.name} ${course.level.name}, taught by ${course.teacher.fullName ?? 'an independent teacher'}.`;
  return text.length <= DESCRIPTION_LENGTH
    ? text
    : `${text.slice(0, DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}
