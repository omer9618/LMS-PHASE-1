/**
 * The admin API (#102–#109 and the admin screens of every other module): response shapes and one
 * typed function per route. Shapes mirror the API's controllers; dates are ISO strings and money
 * is a string of minor units, as everywhere else.
 */
import { api, type QueryValue } from './client';
import type {
  CourseStatus,
  EnrollmentSource,
  EnrollmentStatus,
  Me,
  NamedRef,
  Outline,
  Paged,
  Role,
  TeacherCourse,
} from './types';

// ── Session and role context (#109) ──

export type ContextRole = 'ADMIN' | 'TEACHER';

/** GET /auth/me, with the role context fields (#109). */
export interface MeWithContext extends Me {
  activeContext?: ContextRole | null;
  availableContexts?: ContextRole[];
}

export function switchContext(role: ContextRole) {
  return api.post<MeWithContext>('/auth/context', { role });
}

// ── Dashboard (#102) ──

export interface AdminDashboard {
  generatedAt: string;
  queues: {
    coursesPendingApproval: number;
    teacherApplicationsOpen: number;
    paymentVerificationsPending: number | null;
    payoutConcerns: number | null;
  };
  needsAttention: number;
  today: { since: string; enrollmentsGranted: number };
}

export const getDashboard = (signal?: AbortSignal) =>
  api.get<AdminDashboard>('/admin/dashboard', undefined, signal);

// ── Users (#15, #103) ──

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  isEmailVerified: boolean;
  status: UserStatus;
  roles: Role[];
  mfaEnabled: boolean;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminEnrollment {
  id: string;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  paymentChannel: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  completionPercent?: number;
  student: { id: string; fullName: string | null; email: string };
  course: { id: string; title: string; teacherId: string };
  grantedBy: { id: string; fullName: string | null } | null;
}

export interface AdminCourse extends TeacherCourse {
  teacher: { id: string; email: string; fullName: string | null };
  pricedAt?: string | null;
}

export interface AdminUserOverview {
  user: AdminUser;
  enrollments: Paged<AdminEnrollment>;
  coursesTaught: { items: AdminCourse[]; total: number } | null;
}

export interface UserListQuery {
  role?: Role | '';
  status?: UserStatus | '';
  q?: string;
  limit?: number;
  offset?: number;
}

export const listUsers = (query: UserListQuery, signal?: AbortSignal) =>
  api.get<Paged<AdminUser>>('/admin/users', clean(query), signal);
export const getUserOverview = (userId: string, signal?: AbortSignal) =>
  api.get<AdminUserOverview>(`/admin/users/${userId}/overview`, undefined, signal);
export const createStaffAccount = (body: {
  email: string;
  fullName: string;
  roles: Array<'ADMIN' | 'TEACHER'>;
}) => api.post<AdminUser>('/admin/users', body);
export const suspendUser = (userId: string, reason: string) =>
  api.post<AdminUser>(`/admin/users/${userId}/suspend`, { reason });
export const reactivateUser = (userId: string, reason: string) =>
  api.post<AdminUser>(`/admin/users/${userId}/reactivate`, { reason });
export const sendPasswordReset = (userId: string) =>
  api.post<{ sent: boolean }>(`/admin/users/${userId}/password-reset`);
export const grantRole = (userId: string, role: Role) =>
  api.post<AdminUser>(`/admin/users/${userId}/roles`, { role });
export const revokeRole = (userId: string, role: Role) =>
  api.delete<AdminUser>(`/admin/users/${userId}/roles/${role}`);
export const deactivateTeacher = (teacherId: string, reason: string) =>
  api.post<AdminUser>(`/admin/teachers/${teacherId}/deactivate`, { reason });

// ── Teacher applications (#20, #21) ──

export type ApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'REJECTED' | 'HIRED';

export interface TeacherApplication {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  subjects: string | null;
  status: ApplicationStatus;
  reviewedAt: string | null;
  reviewNotes: string | null;
  purgeAfter: string | null;
  createdAt: string;
  reviewedBy: { id: string; email: string; fullName: string | null } | null;
  user: { id: string; email: string; fullName: string | null; status: UserStatus } | null;
}

export const listApplications = (
  query: { status?: ApplicationStatus | ''; q?: string; limit?: number; offset?: number },
  signal?: AbortSignal,
) => api.get<Paged<TeacherApplication>>('/admin/teacher-applications', clean(query), signal);
export const getApplication = (id: string, signal?: AbortSignal) =>
  api.get<TeacherApplication>(`/admin/teacher-applications/${id}`, undefined, signal);
export const getApplicationCv = (id: string) =>
  api.get<{ url: string; expiresInSeconds: number }>(`/admin/teacher-applications/${id}/cv`);
export const reviewApplication = (
  id: string,
  body: { status: 'UNDER_REVIEW' | 'REJECTED' | 'HIRED'; notes?: string },
) => api.post<TeacherApplication>(`/admin/teacher-applications/${id}/review`, body);
export const createAccountFromApplication = (id: string, fullName?: string) =>
  api.post<TeacherApplication>(
    `/admin/teacher-applications/${id}/account`,
    fullName ? { fullName } : {},
  );
export const linkApplication = (id: string, userId: string) =>
  api.post<TeacherApplication>(`/admin/teacher-applications/${id}/link`, { userId });

// ── Courses (#28–#33) ──

export const listCoursesForReview = (
  query: { status?: CourseStatus; limit?: number; offset?: number },
  signal?: AbortSignal,
) => api.get<AdminCourse[]>('/admin/courses', clean(query), signal);
export const getCourse = (courseId: string, signal?: AbortSignal) =>
  api.get<AdminCourse>(`/admin/courses/${courseId}`, undefined, signal);
export const getCourseOutline = (courseId: string, signal?: AbortSignal) =>
  api.get<Outline>(`/admin/courses/${courseId}/outline`, undefined, signal);
export const approveCourse = (courseId: string) =>
  api.post<AdminCourse>(`/admin/courses/${courseId}/approve`);
export const rejectCourse = (courseId: string, reason: string) =>
  api.post<AdminCourse>(`/admin/courses/${courseId}/reject`, { reason });
export const unpublishCourse = (courseId: string, reason: string) =>
  api.post<AdminCourse>(`/admin/courses/${courseId}/unpublish`, { reason });
export const archiveCourse = (courseId: string, reason?: string) =>
  api.post<AdminCourse>(`/admin/courses/${courseId}/archive`, reason ? { reason } : {});
export const setCourseEnrollment = (courseId: string, open: boolean) =>
  api.put<AdminCourse>(`/admin/courses/${courseId}/enrollment`, { open });
export type PricingInput =
  | { isFree: true }
  | { isFree: false; priceMinor: string; currency: string; commissionRateBps: number };
export const setCoursePricing = (courseId: string, body: PricingInput) =>
  api.put<AdminCourse>(`/admin/courses/${courseId}/pricing`, body);
export interface CourseDetailsInput {
  title?: string;
  description?: string | null;
  syllabusArea?: string | null;
  progressionMode?: 'FREE' | 'SEQUENTIAL';
}
export const updateCourse = (courseId: string, body: CourseDetailsInput) =>
  api.patch<AdminCourse>(`/admin/courses/${courseId}`, body);

// ── Enrollments (#49) ──

export const listEnrollments = (
  query: {
    courseId?: string;
    studentId?: string;
    status?: EnrollmentStatus | '';
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
) => api.get<Paged<AdminEnrollment>>('/admin/enrollments', clean(query), signal);
export const grantEnrollment = (body: {
  studentEmail: string;
  courseId: string;
  paymentChannel: string;
  reason: string;
  expiresAt?: string;
}) => api.post<AdminEnrollment>('/admin/enrollments', body);
export const revokeEnrollment = (enrollmentId: string, reason: string) =>
  api.post<AdminEnrollment>(`/admin/enrollments/${enrollmentId}/revoke`, { reason });

// ── Platform settings (#8) and audit log (#108) ──

export interface PlatformSetting {
  key: string;
  value: number | string | boolean;
  defaultValue: number | string | boolean;
  description: string;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; email: string } | null;
}

export const listSettings = (signal?: AbortSignal) =>
  api.get<PlatformSetting[]>('/admin/settings', undefined, signal);
export const updateSetting = (key: string, value: number | string | boolean) =>
  api.put<PlatformSetting>(`/admin/settings/${key}`, { value });

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; email: string } | null;
}

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

export const searchAuditLog = (query: AuditQuery, signal?: AbortSignal) =>
  api.get<Paged<AuditEntry>>('/admin/audit-log', clean(query), signal);

// ── Teacher profiles (#100) ──

export interface SocialLink {
  label: string;
  url: string;
}
export interface F2fLocation {
  city: string;
  area?: string;
  notes?: string;
}
export interface TeacherProfile {
  teacherId: string;
  fullName: string | null;
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
  photoUrl: string | null;
  isPublished: boolean;
  moderation: { unpublishedAt: string; reason: string | null } | null;
}
export interface ProfileFieldsInput {
  bio?: string | null;
  qualifications?: string | null;
  socialLinks?: SocialLink[];
  f2fLocations?: F2fLocation[];
}

export const getTeacherProfile = (teacherId: string, signal?: AbortSignal) =>
  api.get<TeacherProfile>(`/admin/teachers/${teacherId}/profile`, undefined, signal);
export const updateTeacherProfile = (teacherId: string, body: ProfileFieldsInput) =>
  api.put<TeacherProfile>(`/admin/teachers/${teacherId}/profile`, body);
export const unpublishTeacherProfile = (teacherId: string, reason: string) =>
  api.post<TeacherProfile>(`/admin/teachers/${teacherId}/profile/unpublish`, { reason });
export const removeTeacherPhoto = (teacherId: string, reason: string) =>
  api.post<TeacherProfile>(`/admin/teachers/${teacherId}/profile/photo/remove`, { reason });

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
