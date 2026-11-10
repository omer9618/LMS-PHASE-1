/**
 * Shapes of the API responses the web app reads (the `data` of the envelope). Dates arrive as ISO
 * strings and money as strings of minor units.
 *
 * Areas moved to zod (docs/UI_PLAN.md, phase 1) are re-exported from `./schemas`, where the type
 * is inferred from the schema that checks the response. Request bodies and the few shapes nobody parses stay as
 * plain interfaces.
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

export type {
  AudienceType,
  AuthoringLesson,
  AuthoringSection,
  LessonResource,
  Outline,
  RosterEntry,
  TeacherCourse,
  UploadTicket,
  VideoStatus,
} from './schemas/teacher';

// ── Teacher applications (#18) ──

export interface SubmittedApplication {
  id: string;
  status: string;
  submittedAt: string;
}
