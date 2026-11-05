/**
 * Shapes of the API responses the web app reads (the `data` of the envelope). Dates arrive as ISO
 * strings and money as strings of minor units.
 */

export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  isEmailVerified: boolean;
  roles: Role[];
}

/** GET /auth/me */
export interface Me extends User {
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

/** POST /auth/login */
export type LoginResult =
  | { user: User; mfaRequired?: undefined }
  | { mfaRequired: true; challengeToken: string; expiresAt: string };

export interface NamedRef {
  id: string;
  name: string;
}

export interface Board extends NamedRef {
  code: string;
}

export interface Level extends NamedRef {
  boardId: string;
  orderIndex: number;
}

export interface CatalogueSubject extends NamedRef {
  courseCount: number;
}

export type Pacing = 'FREE' | 'SEQUENTIAL';

export interface CourseCard {
  id: string;
  title: string;
  description: string | null;
  syllabusArea: string | null;
  isFree: boolean;
  /** Minor units; null for free courses. */
  priceMinor: string | null;
  currency: string | null;
  progressionMode: Pacing;
  isEnrollmentOpen: boolean;
  publishedAt: string | null;
  board: NamedRef;
  level: NamedRef;
  subject: NamedRef;
  teacher: { id: string; fullName: string | null };
}

/** GET /catalogue/courses */
export interface CatalogueListing {
  items: CourseCard[];
  total: number;
  limit: number;
  offset: number;
  /** #44: the criterion behind the order, to show with the results. */
  ordering: string;
}

export type LessonType = 'VIDEO' | 'PDF' | 'TEXT' | 'QUIZ' | (string & {});

export interface OutlineLesson {
  id: string;
  title: string;
  type: LessonType;
  isFreePreview: boolean;
  durationSeconds: number | null;
}

/** GET /catalogue/courses/:courseId */
export interface CourseDetail extends Omit<CourseCard, 'teacher'> {
  teacher: {
    id: string;
    fullName: string | null;
    profile: { bio: string | null; photoUrl: string | null; qualifications: string | null } | null;
  };
  outline: Array<{ id: string; title: string; lessons: OutlineLesson[] }>;
  demoLessonIds: string[];
  lessonCount: number;
  totalVideoSeconds: number;
}

/** GET /courses/:courseId/lessons/:lessonId/playback */
export interface Playback {
  embedUrl: string;
  expiresAt: string;
  durationSeconds: number | null;
}

export type AccessState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NONE';
export type EnrollmentStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';
export type EnrollmentSource = 'PURCHASE' | 'FREE' | 'ADMIN_GRANT';

/** GET /me/enrollments (#52). */
export interface DashboardEntry {
  id: string;
  status?: EnrollmentStatus;
  source?: EnrollmentSource;
  grantedAt?: string;
  expiresAt?: string | null;
  access: AccessState;
  completionPercent?: number;
  completedLessons?: number;
  totalLessons?: number;
  course: {
    id: string;
    title: string;
    status?: CourseStatus;
    subject?: NamedRef;
    teacher?: { id: string; fullName: string | null };
  };
}

/** A page of results (admin and teacher lists). */
export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Teacher authoring (#24–#33) ──

export type CourseStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
export type AudienceType = 'STUDENT' | 'TEACHER_PD';

/** GET /teacher/courses[/:id] */
export interface TeacherCourse {
  id: string;
  teacherId: string;
  boardId: string;
  levelId: string;
  subjectId: string;
  syllabusArea: string | null;
  title: string;
  description: string | null;
  priceMinor: string | null;
  currency: string | null;
  commissionRateBps: number | null;
  teacherProposedBps: number | null;
  isFree: boolean;
  status: CourseStatus;
  progressionMode: Pacing;
  audienceType: AudienceType;
  isEnrollmentOpen: boolean;
  createdAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  board: NamedRef;
  level: NamedRef;
  subject: NamedRef;
  /** Set when REJECTED (#28): the admin's reason. */
  rejectionReason: string | null;
}

export type VideoStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface LessonResource {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  orderIndex: number;
}

export interface AuthoringLesson {
  id: string;
  sectionId: string;
  title: string;
  type: LessonType;
  orderIndex: number;
  bodyText: string | null;
  isFreePreview: boolean;
  videoAsset: {
    id: string;
    provider: string;
    status: VideoStatus;
    durationSeconds: number | null;
  } | null;
  resources: LessonResource[];
}

export interface AuthoringSection {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  lessons: AuthoringLesson[];
}

/** Every outline change answers with the whole outline. */
export interface Outline {
  courseId: string;
  sections: AuthoringSection[];
}

/** POST .../video: TUS credentials for a direct upload to the video host (#36). */
export interface UploadTicket {
  videoAssetId: string;
  upload: {
    protocol: 'tus';
    endpoint: string;
    headers: Record<string, string>;
    metadata: Record<string, string>;
    expiresAt: string;
  };
}

/** GET /teacher/courses/:id/enrollments (#50, view only). */
export interface RosterEntry {
  id: string;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  completionPercent?: number;
  student: { id: string; fullName: string | null; email: string };
}

// ── MFA (#16) ──

export interface MfaStatus {
  enabled: boolean;
  required: boolean;
  recoveryCodesRemaining: number;
}

// ── Teacher applications (#18) ──

export interface SubmittedApplication {
  id: string;
  status: string;
  submittedAt: string;
}
