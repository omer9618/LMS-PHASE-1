/**
 * The admin API (#102–#109 and the admin screens of every other module): one function per route.
 * Every response is checked with its zod schema (./schemas/admin); the types are inferred there.
 */
import type { z } from 'zod';
import type { pricingForm } from '@/lib/forms/admin';
import { api, type QueryValue } from './client';
import * as schema from './schemas/admin';
import type { ApplicationStatus, ContextRole, UserStatus } from './schemas/admin';
import { paged } from './schemas/common';
import { outline, teacherProfile } from './schemas/teacher';
import type { CourseStatus, EnrollmentStatus, NamedRef, Role } from './types';

export type {
  AdminCourse,
  AdminDashboard,
  AdminEnrollment,
  AdminUser,
  AdminUserOverview,
  ApplicationStatus,
  AuditEntry,
  ContextRole,
  MeWithContext,
  PlatformSetting,
  TeacherApplication,
  UserStatus,
} from './schemas/admin';
export type { F2fLocation, SocialLink, TeacherProfile } from './schemas/teacher';

// ── Session and role context (#109) ──

function switchContext(role: ContextRole) {
  return api.post('/auth/context', schema.meWithContext, { role });
}

// ── Dashboard (#102) ──

const getDashboard = (signal?: AbortSignal) =>
  api.get('/admin/dashboard', schema.adminDashboard, undefined, signal);

// ── Users (#15, #103) ──

export interface UserListQuery {
  role?: Role | '';
  status?: UserStatus | '';
  q?: string;
  limit?: number;
  offset?: number;
}

const listUsers = (query: UserListQuery, signal?: AbortSignal) =>
  api.get('/admin/users', paged(schema.adminUser), clean(query), signal);
const getUserOverview = (userId: string, signal?: AbortSignal) =>
  api.get(`/admin/users/${userId}/overview`, schema.adminUserOverview, undefined, signal);
const createStaffAccount = (body: {
  email: string;
  fullName: string;
  roles: Array<'ADMIN' | 'TEACHER'>;
}) => api.post('/admin/users', schema.adminUser, body);
const suspendUser = (userId: string, reason: string) =>
  api.post(`/admin/users/${userId}/suspend`, schema.adminUser, { reason });
const reactivateUser = (userId: string, reason: string) =>
  api.post(`/admin/users/${userId}/reactivate`, schema.adminUser, { reason });
const sendPasswordReset = (userId: string) =>
  api.post(`/admin/users/${userId}/password-reset`, schema.sent);
const grantRole = (userId: string, role: Role) =>
  api.post(`/admin/users/${userId}/roles`, schema.adminUser, { role });
const revokeRole = (userId: string, role: Role) =>
  api.delete(`/admin/users/${userId}/roles/${role}`, schema.adminUser);
const deactivateTeacher = (teacherId: string, reason: string) =>
  api.post(`/admin/teachers/${teacherId}/deactivate`, schema.adminUser, { reason });

// ── Teacher applications (#20, #21) ──

const listApplications = (
  query: { status?: ApplicationStatus | ''; q?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) => api.get('/admin/teacher-applications', paged(schema.teacherApplication), clean(query), signal);
const getApplication = (id: string, signal?: AbortSignal) =>
  api.get(`/admin/teacher-applications/${id}`, schema.teacherApplication, undefined, signal);
const getApplicationCv = (id: string) =>
  api.get(`/admin/teacher-applications/${id}/cv`, schema.signedDownload);
const reviewApplication = (
  id: string,
  body: { status: 'UNDER_REVIEW' | 'REJECTED' | 'HIRED'; notes?: string },
) => api.post(`/admin/teacher-applications/${id}/review`, schema.teacherApplication, body);
const createAccountFromApplication = (id: string, fullName?: string) =>
  api.post(
    `/admin/teacher-applications/${id}/account`,
    schema.teacherApplication,
    fullName ? { fullName } : {},
  );
const linkApplication = (id: string, userId: string) =>
  api.post(`/admin/teacher-applications/${id}/link`, schema.teacherApplication, { userId });

// ── Courses (#28–#33) ──

const listCoursesForReview = (
  query: { status?: CourseStatus; limit?: number; offset?: number },
  signal?: AbortSignal,
) => api.get('/admin/courses', schema.adminCourses, clean(query), signal);
const getCourse = (courseId: string, signal?: AbortSignal) =>
  api.get(`/admin/courses/${courseId}`, schema.adminCourse, undefined, signal);
const getCourseOutline = (courseId: string, signal?: AbortSignal) =>
  api.get(`/admin/courses/${courseId}/outline`, outline, undefined, signal);
const approveCourse = (courseId: string) =>
  api.post(`/admin/courses/${courseId}/approve`, schema.adminCourse);
const rejectCourse = (courseId: string, reason: string) =>
  api.post(`/admin/courses/${courseId}/reject`, schema.adminCourse, { reason });
const unpublishCourse = (courseId: string, reason: string) =>
  api.post(`/admin/courses/${courseId}/unpublish`, schema.adminCourse, { reason });
const archiveCourse = (courseId: string, reason?: string) =>
  api.post(`/admin/courses/${courseId}/archive`, schema.adminCourse, reason ? { reason } : {});
const setCourseEnrollment = (courseId: string, open: boolean) =>
  api.put(`/admin/courses/${courseId}/enrollment`, schema.adminCourse, { open });
export type PricingInput = z.output<typeof pricingForm>;
const setCoursePricing = (courseId: string, body: PricingInput) =>
  api.put(`/admin/courses/${courseId}/pricing`, schema.adminCourse, body);
export interface CourseDetailsInput {
  title?: string;
  description?: string | null;
  syllabusArea?: string | null;
  progressionMode?: 'FREE' | 'SEQUENTIAL';
}
const updateCourse = (courseId: string, body: CourseDetailsInput) =>
  api.patch(`/admin/courses/${courseId}`, schema.adminCourse, body);

// ── Enrollments (#49) ──

const listEnrollments = (
  query: {
    courseId?: string;
    studentId?: string;
    status?: EnrollmentStatus | '';
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
) => api.get('/admin/enrollments', paged(schema.adminEnrollment), clean(query), signal);
const grantEnrollment = (body: {
  studentEmail: string;
  courseId: string;
  paymentChannel: string;
  reason: string;
  expiresAt?: string;
}) => api.post('/admin/enrollments', schema.adminEnrollment, body);
const revokeEnrollment = (enrollmentId: string, reason: string) =>
  api.post(`/admin/enrollments/${enrollmentId}/revoke`, schema.adminEnrollment, { reason });

// ── Platform settings (#8) and audit log (#108) ──

const listSettings = (signal?: AbortSignal) =>
  api.get('/admin/settings', schema.platformSettings, undefined, signal);
const updateSetting = (key: string, value: number | string | boolean) =>
  api.put(`/admin/settings/${key}`, schema.platformSetting, { value });

export interface AuditQuery {
  actorEmail?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const searchAuditLog = (query: AuditQuery, signal?: AbortSignal) =>
  api.get('/admin/audit-log', paged(schema.auditEntry), clean(query), signal);

// ── Teacher profiles (#100) ──

export interface ProfileFieldsInput {
  bio?: string | null;
  qualifications?: string | null;
  socialLinks?: Array<{ label: string; url: string }>;
  f2fLocations?: Array<{ city: string; area?: string; notes?: string }>;
}

const getTeacherProfile = (teacherId: string, signal?: AbortSignal) =>
  api.get(`/admin/teachers/${teacherId}/profile`, teacherProfile, undefined, signal);
const updateTeacherProfile = (teacherId: string, body: ProfileFieldsInput) =>
  api.put(`/admin/teachers/${teacherId}/profile`, teacherProfile, body);
const unpublishTeacherProfile = (teacherId: string, reason: string) =>
  api.post(`/admin/teachers/${teacherId}/profile/unpublish`, teacherProfile, { reason });
const removeTeacherPhoto = (teacherId: string, reason: string) =>
  api.post(`/admin/teachers/${teacherId}/profile/photo/remove`, teacherProfile, { reason });

// ── Helpers ──

/** Drops empty filters so they are not sent. */
export function clean(query: object): Record<string, QueryValue> {
  const out: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value as QueryValue;
  }
  return out;
}

export type { NamedRef };

/** Every admin call, by name: `adminApi.switchContext(...)`. */
export const adminApi = {
  switchContext,
  getDashboard,
  listUsers,
  getUserOverview,
  createStaffAccount,
  suspendUser,
  reactivateUser,
  sendPasswordReset,
  grantRole,
  revokeRole,
  deactivateTeacher,
  listApplications,
  getApplication,
  getApplicationCv,
  reviewApplication,
  createAccountFromApplication,
  linkApplication,
  listCoursesForReview,
  getCourse,
  getCourseOutline,
  approveCourse,
  rejectCourse,
  unpublishCourse,
  archiveCourse,
  setCourseEnrollment,
  setCoursePricing,
  updateCourse,
  listEnrollments,
  grantEnrollment,
  revokeEnrollment,
  listSettings,
  updateSetting,
  searchAuditLog,
  getTeacherProfile,
  updateTeacherProfile,
  unpublishTeacherProfile,
  removeTeacherPhoto,
};
