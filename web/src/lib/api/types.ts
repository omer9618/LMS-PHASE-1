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

/** GET /me/enrollments (only the fields the web app reads). */
export interface DashboardEntry {
  id: string;
  access: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NONE';
  course: { id: string; title: string };
}
