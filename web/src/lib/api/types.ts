/**
 * Shapes of the API responses the web app reads (the `data` of the envelope). Dates arrive as ISO
 * strings and money as strings of minor units.
 *
 * Areas moved to zod (docs/UI_PLAN.md, phase 1) are re-exported from `./schemas`, where the type
 * is inferred from the schema that checks the response. The interfaces further down are not
 * checked yet; they move area by area.
 */

export type { LoginResult, Me, MfaStatus, Role, User } from './schemas/auth';
export type {
  Board,
  CatalogueListing,
  CatalogueSubject,
  CourseCard,
  CourseDetail,
  LessonType,
  Level,
  OutlineLesson,
  Pacing,
  Playback,
} from './schemas/catalogue';
export type { NamedRef, Paged } from './schemas/common';
export type {
  AccessState,
  CourseStatus,
  DashboardEntry,
  EnrollmentSource,
  EnrollmentStatus,
} from './schemas/enrollment';

import type { NamedRef } from './schemas/common';
import type { LessonType, Pacing } from './schemas/catalogue';
import type { CourseStatus, EnrollmentSource, EnrollmentStatus } from './schemas/enrollment';

// ── Teacher authoring (#24–#33) ──

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

// ── Teacher applications (#18) ──

export interface SubmittedApplication {
  id: string;
  status: string;
  submittedAt: string;
}
