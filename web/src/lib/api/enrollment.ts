import { api } from './client';
import { ignored } from './schemas/common';
import * as schema from './schemas/enrollment';

/** The signed-in student's enrollments. */
export const enrollmentApi = {
  mine: (signal?: AbortSignal) => api.get('/me/enrollments', schema.dashboard, undefined, signal),
  enrollFree: (courseId: string) => api.post(`/courses/${courseId}/enroll`, ignored),
};
