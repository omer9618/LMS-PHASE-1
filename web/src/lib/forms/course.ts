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
