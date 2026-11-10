import type { Pacing } from '@/lib/api/schemas/catalogue';
import type { TeacherCourse } from '@/lib/api/schemas/teacher';
import type { CourseDetailsInput } from '@/lib/api/teacher';
import { z } from 'zod';

/** A teacher's course details (#24, #26). Board, level and subject are chosen together. */
export const courseDetailsForm = z.object({
  boardId: z.string().min(1, 'Choose an exam board'),
  levelId: z.string().min(1, 'Choose a level'),
  subjectId: z.string().min(1, 'Choose a subject'),
  title: z.string().trim().min(1, 'Give the course a title'),
  syllabusArea: z.string(),
  description: z.string(),
  progressionMode: z.enum(['FREE', 'SEQUENTIAL']),
});
export type CourseDetailsFormValues = z.input<typeof courseDetailsForm>;

export interface DetailsValues {
  boardId: string;
  levelId: string;
  subjectId: string;
  title: string;
  syllabusArea: string;
  description: string;
  progressionMode: Pacing;
}

export function initialValues(course?: TeacherCourse): DetailsValues {
  return {
    boardId: course?.boardId ?? '',
    levelId: course?.levelId ?? '',
    subjectId: course?.subjectId ?? '',
    title: course?.title ?? '',
    syllabusArea: course?.syllabusArea ?? '',
    description: course?.description ?? '',
    progressionMode: course?.progressionMode ?? 'FREE',
  };
}

/**
 * The body to send: everything when creating; only what changed when editing, with board, level
 * and subject always together (the API validates them as one classification).
 */
export function detailsBody(values: DetailsValues, course?: TeacherCourse): CourseDetailsInput {
  const full: CourseDetailsInput = {
    boardId: values.boardId,
    levelId: values.levelId,
    subjectId: values.subjectId,
    title: values.title.trim(),
    syllabusArea: values.syllabusArea.trim() || null,
    description: values.description.trim() || null,
    progressionMode: values.progressionMode,
  };
  if (!course) {
    if (!full.syllabusArea) delete full.syllabusArea;
    if (!full.description) delete full.description;
    return full;
  }
  const before = detailsBody(initialValues(course));
  const changed: CourseDetailsInput = {};
  if (
    full.boardId !== course.boardId ||
    full.levelId !== course.levelId ||
    full.subjectId !== course.subjectId
  ) {
    changed.boardId = full.boardId;
    changed.levelId = full.levelId;
    changed.subjectId = full.subjectId;
  }
  if (full.title !== course.title) changed.title = full.title;
  if (full.syllabusArea !== (before.syllabusArea ?? null)) changed.syllabusArea = full.syllabusArea;
  if (full.description !== (before.description ?? null)) changed.description = full.description;
  if (full.progressionMode !== course.progressionMode) {
    changed.progressionMode = full.progressionMode;
  }
  return changed;
}
