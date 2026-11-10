import { z } from 'zod';
import { toCatalogueApiQuery, type CatalogueFilters } from '@/lib/catalogue-url';
import { api } from './client';
import * as schema from './schemas/catalogue';
import { namedRef } from './schemas/common';

/** The public catalogue and the reference lists (boards, levels, subjects) behind its filters. */
export const catalogueApi = {
  listing: (filters: CatalogueFilters, signal?: AbortSignal) =>
    api.get('/catalogue/courses', schema.catalogueListing, toCatalogueApiQuery(filters), signal),
  course: (courseId: string, signal?: AbortSignal) =>
    api.get(`/catalogue/courses/${courseId}`, schema.courseDetail, undefined, signal),
  /** Subjects that have at least one published course. */
  subjects: (signal?: AbortSignal) =>
    api.get('/catalogue/subjects', z.array(schema.catalogueSubject), undefined, signal),
  /** Every subject, for the course form. */
  allSubjects: (signal?: AbortSignal) => api.get('/subjects', z.array(namedRef), undefined, signal),
  boards: (signal?: AbortSignal) => api.get('/boards', z.array(schema.board), undefined, signal),
  levels: (boardId: string, signal?: AbortSignal) =>
    api.get(`/boards/${boardId}/levels`, z.array(schema.level), undefined, signal),
  /** The free-preview video of a lesson. */
  demoPlayback: (courseId: string, lessonId: string, signal?: AbortSignal) =>
    api.get(
      `/courses/${courseId}/lessons/${lessonId}/playback`,
      schema.playback,
      undefined,
      signal,
    ),
};
