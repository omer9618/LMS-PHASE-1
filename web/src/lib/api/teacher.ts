import { api } from './client';
import type {
  CourseStatus,
  LessonResource,
  LessonType,
  Outline,
  Paged,
  Pacing,
  RosterEntry,
  TeacherCourse,
  UploadTicket,
} from './types';

/** Course details a teacher sets (#24, #33). Board, level and subject change together. */
export interface CourseDetailsInput {
  boardId?: string;
  levelId?: string;
  subjectId?: string;
  title?: string;
  syllabusArea?: string | null;
  description?: string | null;
  progressionMode?: Pacing;
}

const course = (id: string) => `/teacher/courses/${id}`;

/** The teacher authoring endpoints (#24–#33, #36, #38, #50). Every outline change returns the outline. */
export const teacherApi = {
  listCourses: (status?: CourseStatus, signal?: AbortSignal) =>
    api.get<TeacherCourse[]>('/teacher/courses', { status, limit: 100 }, signal),
  getCourse: (id: string, signal?: AbortSignal) =>
    api.get<TeacherCourse>(course(id), undefined, signal),
  createCourse: (input: CourseDetailsInput) => api.post<TeacherCourse>('/teacher/courses', input),
  updateCourse: (id: string, input: CourseDetailsInput) =>
    api.patch<TeacherCourse>(course(id), input),
  submitCourse: (id: string, teacherProposedBps?: number) =>
    api.post<TeacherCourse>(
      `${course(id)}/submit`,
      teacherProposedBps === undefined ? {} : { teacherProposedBps },
    ),
  archiveCourse: (id: string) => api.post<TeacherCourse>(`${course(id)}/archive`),
  deleteCourse: (id: string) => api.delete<{ deleted: true }>(course(id)),
  setEnrollmentOpen: (id: string, open: boolean) =>
    api.put<TeacherCourse>(`${course(id)}/enrollment`, { open }),

  getOutline: (id: string, signal?: AbortSignal) =>
    api.get<Outline>(`${course(id)}/outline`, undefined, signal),
  addSection: (id: string, title: string) => api.post<Outline>(`${course(id)}/sections`, { title }),
  renameSection: (id: string, sectionId: string, title: string) =>
    api.patch<Outline>(`${course(id)}/sections/${sectionId}`, { title }),
  deleteSection: (id: string, sectionId: string) =>
    api.delete<Outline>(`${course(id)}/sections/${sectionId}`),
  orderSections: (id: string, sectionIds: string[]) =>
    api.put<Outline>(`${course(id)}/sections/order`, { sectionIds }),
  addLesson: (
    id: string,
    sectionId: string,
    input: { title: string; type: LessonType; isFreePreview?: boolean; bodyText?: string },
  ) => api.post<Outline>(`${course(id)}/sections/${sectionId}/lessons`, input),
  updateLesson: (
    id: string,
    lessonId: string,
    input: { title?: string; bodyText?: string; isFreePreview?: boolean },
  ) => api.patch<Outline>(`${course(id)}/lessons/${lessonId}`, input),
  deleteLesson: (id: string, lessonId: string) =>
    api.delete<Outline>(`${course(id)}/lessons/${lessonId}`),
  orderLessons: (id: string, sectionId: string, lessonIds: string[]) =>
    api.put<Outline>(`${course(id)}/sections/${sectionId}/lessons/order`, { lessonIds }),
  moveLesson: (id: string, lessonId: string, sectionId: string, position: number) =>
    api.post<Outline>(`${course(id)}/lessons/${lessonId}/move`, { sectionId, position }),

  startVideoUpload: (id: string, lessonId: string, title?: string) =>
    api.post<UploadTicket>(`${course(id)}/lessons/${lessonId}/video`, title ? { title } : {}),
  refreshVideo: (id: string, lessonId: string) =>
    api.post<{ id: string; status: string; durationSeconds: number | null }>(
      `${course(id)}/lessons/${lessonId}/video/refresh`,
    ),
  uploadResource: (id: string, lessonId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm<LessonResource[]>(`${course(id)}/lessons/${lessonId}/resources`, form);
  },
  deleteResource: (id: string, lessonId: string, resourceId: string) =>
    api.delete<LessonResource[]>(`${course(id)}/lessons/${lessonId}/resources/${resourceId}`),

  roster: (
    id: string,
    query: { limit: number; offset: number; status?: string },
    signal?: AbortSignal,
  ) => api.get<Paged<RosterEntry>>(`${course(id)}/enrollments`, query, signal),
};

/** Moves item `index` one step up (-1) or down (+1); the same array when it cannot move. */
export function moveItem<T>(items: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** Percent typed by a person ("12.5") → basis points (1250), string maths; null if invalid. */
export function percentToBps(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!match) return null;
  const bps = Number(`${match[1]}${(match[2] ?? '').padEnd(2, '0')}`);
  return bps <= 10_000 ? bps : null;
}

/** What the submit checklist (#34) needs: a free-preview video lesson with a video attached. */
export function submitChecklist(outline: Outline | null): Array<{ label: string; done: boolean }> {
  const lessons = outline?.sections.flatMap((s) => s.lessons) ?? [];
  return [
    { label: 'At least one section', done: (outline?.sections.length ?? 0) > 0 },
    { label: 'At least one lesson', done: lessons.length > 0 },
    {
      label: 'A video lesson with an uploaded video, marked as a free preview (the demo)',
      done: lessons.some((l) => l.type === 'VIDEO' && l.isFreePreview && l.videoAsset !== null),
    },
  ];
}
