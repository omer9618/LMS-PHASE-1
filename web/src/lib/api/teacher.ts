import { api } from './client';
import { paged } from './schemas/common';
import * as schema from './schemas/teacher';
import type { CourseStatus } from '@/lib/api/schemas/enrollment';
import type { LessonType, Pacing } from '@/lib/api/schemas/catalogue';
import type { Outline } from '@/lib/api/schemas/teacher';

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
    api.get('/teacher/courses', schema.teacherCourses, { status, limit: 100 }, signal),
  getCourse: (id: string, signal?: AbortSignal) =>
    api.get(course(id), schema.teacherCourse, undefined, signal),
  createCourse: (input: CourseDetailsInput) =>
    api.post('/teacher/courses', schema.teacherCourse, input),
  updateCourse: (id: string, input: CourseDetailsInput) =>
    api.patch(course(id), schema.teacherCourse, input),
  submitCourse: (id: string, teacherProposedBps?: number) =>
    api.post(
      `${course(id)}/submit`,
      schema.teacherCourse,
      teacherProposedBps === undefined ? {} : { teacherProposedBps },
    ),
  archiveCourse: (id: string) => api.post(`${course(id)}/archive`, schema.teacherCourse),
  deleteCourse: (id: string) => api.delete(course(id), schema.deleted),
  setEnrollmentOpen: (id: string, open: boolean) =>
    api.put(`${course(id)}/enrollment`, schema.teacherCourse, { open }),

  getOutline: (id: string, signal?: AbortSignal) =>
    api.get(`${course(id)}/outline`, schema.outline, undefined, signal),
  addSection: (id: string, title: string) =>
    api.post(`${course(id)}/sections`, schema.outline, { title }),
  renameSection: (id: string, sectionId: string, title: string) =>
    api.patch(`${course(id)}/sections/${sectionId}`, schema.outline, { title }),
  deleteSection: (id: string, sectionId: string) =>
    api.delete(`${course(id)}/sections/${sectionId}`, schema.outline),
  orderSections: (id: string, sectionIds: string[]) =>
    api.put(`${course(id)}/sections/order`, schema.outline, { sectionIds }),
  addLesson: (
    id: string,
    sectionId: string,
    input: { title: string; type: LessonType; isFreePreview?: boolean; bodyText?: string },
  ) => api.post(`${course(id)}/sections/${sectionId}/lessons`, schema.outline, input),
  updateLesson: (
    id: string,
    lessonId: string,
    input: { title?: string; bodyText?: string; isFreePreview?: boolean },
  ) => api.patch(`${course(id)}/lessons/${lessonId}`, schema.outline, input),
  deleteLesson: (id: string, lessonId: string) =>
    api.delete(`${course(id)}/lessons/${lessonId}`, schema.outline),
  orderLessons: (id: string, sectionId: string, lessonIds: string[]) =>
    api.put(`${course(id)}/sections/${sectionId}/lessons/order`, schema.outline, { lessonIds }),
  moveLesson: (id: string, lessonId: string, sectionId: string, position: number) =>
    api.post(`${course(id)}/lessons/${lessonId}/move`, schema.outline, { sectionId, position }),

  startVideoUpload: (id: string, lessonId: string, title?: string) =>
    api.post(
      `${course(id)}/lessons/${lessonId}/video`,
      schema.uploadTicket,
      title ? { title } : {},
    ),
  refreshVideo: (id: string, lessonId: string) =>
    api.post(`${course(id)}/lessons/${lessonId}/video/refresh`, schema.videoRefresh),
  uploadResource: (id: string, lessonId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.postForm(
      `${course(id)}/lessons/${lessonId}/resources`,
      schema.lessonResources,
      form,
    );
  },
  deleteResource: (id: string, lessonId: string, resourceId: string) =>
    api.delete(`${course(id)}/lessons/${lessonId}/resources/${resourceId}`, schema.lessonResources),

  roster: (
    id: string,
    query: { limit: number; offset: number; status?: string },
    signal?: AbortSignal,
  ) => api.get(`${course(id)}/enrollments`, paged(schema.rosterEntry), query, signal),
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
