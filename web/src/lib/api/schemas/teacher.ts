import { z } from 'zod';
import { catalogueListing, lessonType, pacing } from './catalogue';
import {
  currencyCode,
  dateOrDateTime,
  id,
  isoDateTime,
  minorUnits,
  namedRef,
  openEnum,
} from './common';
import { courseStatus, enrollmentSource, enrollmentStatus } from './enrollment';

/** Teacher authoring (#24–#38), roster (#50), earnings (#78–#89) and profiles (#98–#101). */

// ── Courses ──

export const audienceType = z.enum(['STUDENT', 'TEACHER_PD']);
export type AudienceType = z.infer<typeof audienceType>;

/** Basis points: 2000 is 20%. */
const bps = z.number().int().min(0).max(10_000);

/** GET /teacher/courses/:id and every course change. */
export const teacherCourse = z.object({
  id,
  teacherId: id,
  boardId: id,
  levelId: id,
  subjectId: id,
  syllabusArea: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  priceMinor: minorUnits.nullable(),
  currency: currencyCode.nullable(),
  commissionRateBps: bps.nullable(),
  teacherProposedBps: bps.nullable(),
  isFree: z.boolean(),
  status: courseStatus,
  progressionMode: pacing,
  audienceType,
  isEnrollmentOpen: z.boolean(),
  createdAt: isoDateTime,
  publishedAt: isoDateTime.nullable(),
  archivedAt: isoDateTime.nullable(),
  board: namedRef,
  level: namedRef,
  subject: namedRef,
  /** Set when REJECTED (#28): the admin's reason. */
  rejectionReason: z.string().nullable(),
});
export type TeacherCourse = z.infer<typeof teacherCourse>;

/** GET /teacher/courses */
export const teacherCourses = z.array(teacherCourse);

export const deleted = z.object({ deleted: z.literal(true) });

// ── Outline ──

export const videoStatus = z.enum(['PROCESSING', 'READY', 'FAILED']);
export type VideoStatus = z.infer<typeof videoStatus>;

export const lessonResource = z.object({
  id,
  fileName: z.string(),
  fileSizeBytes: z.number().nonnegative(),
  orderIndex: z.number().int(),
});
export type LessonResource = z.infer<typeof lessonResource>;

/** POST/DELETE .../resources: the lesson's files after the change. */
export const lessonResources = z.array(lessonResource);

export const authoringLesson = z.object({
  id,
  sectionId: id,
  title: z.string(),
  type: lessonType,
  orderIndex: z.number().int(),
  bodyText: z.string().nullable(),
  isFreePreview: z.boolean(),
  videoAsset: z
    .object({
      id,
      provider: z.string(),
      status: videoStatus,
      durationSeconds: z.number().nonnegative().nullable(),
    })
    .nullable(),
  resources: z.array(lessonResource),
});
export type AuthoringLesson = z.infer<typeof authoringLesson>;

export const authoringSection = z.object({
  id,
  courseId: id,
  title: z.string(),
  orderIndex: z.number().int(),
  lessons: z.array(authoringLesson),
});
export type AuthoringSection = z.infer<typeof authoringSection>;

/** Every outline change answers with the whole outline. */
export const outline = z.object({ courseId: id, sections: z.array(authoringSection) });
export type Outline = z.infer<typeof outline>;

/** POST .../video: TUS credentials for a direct upload to the video host (#36). */
export const uploadTicket = z.object({
  videoAssetId: id,
  upload: z.object({
    protocol: z.literal('tus'),
    endpoint: z.string(),
    headers: z.record(z.string(), z.string()),
    metadata: z.record(z.string(), z.string()),
    expiresAt: isoDateTime,
  }),
});
export type UploadTicket = z.infer<typeof uploadTicket>;

/** POST .../video/refresh */
export const videoRefresh = z.object({
  id,
  status: z.string(),
  durationSeconds: z.number().nonnegative().nullable(),
});

// ── Roster ──

/** One row of GET /teacher/courses/:id/enrollments (#50, view only). */
export const rosterEntry = z.object({
  id,
  status: enrollmentStatus,
  source: enrollmentSource,
  grantedAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
  completionPercent: z.number().min(0).max(100).optional(),
  student: z.object({ id, fullName: z.string().nullable(), email: z.string() }),
});
export type RosterEntry = z.infer<typeof rosterEntry>;

// ── Earnings and payouts ──

export const currencyBalance = z.object({
  currency: currencyCode,
  balanceMinor: minorUnits,
  earningsMinor: minorUnits,
  refundsMinor: minorUnits,
  payoutsMinor: minorUnits,
  adjustmentsMinor: minorUnits,
  entryCount: z.number().int().nonnegative(),
});
export type CurrencyBalance = z.infer<typeof currencyBalance>;

export const saleItem = z.object({
  id,
  orderId: id,
  paymentReference: z.string(),
  orderStatus: z.string(),
  currency: currencyCode,
  courseId: id,
  courseTitle: z.string(),
  priceMinor: minorUnits,
  commissionRateBps: bps,
  commissionMinor: minorUnits,
  netTeacherMinor: minorUnits,
  orderCreatedAt: isoDateTime,
  orderVerifiedAt: isoDateTime.nullable(),
});
export type SaleItem = z.infer<typeof saleItem>;

export const salesTotals = z.object({
  currency: currencyCode,
  itemCount: z.number().int().nonnegative(),
  grossMinor: minorUnits,
  commissionMinor: minorUnits,
  netTeacherMinor: minorUnits,
});
export type SalesTotals = z.infer<typeof salesTotals>;

export const ledgerEntryType = z.enum(['EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT']);
export type LedgerEntryType = z.infer<typeof ledgerEntryType>;

export const ledgerEntry = z.object({
  id,
  type: ledgerEntryType,
  amountMinor: minorUnits,
  currency: currencyCode,
  orderItemId: id.nullable(),
  payoutId: id.nullable(),
  refundId: id.nullable(),
  description: z.string().nullable(),
  createdAt: isoDateTime,
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

export const payoutStatus = z.enum(['PENDING', 'ACCEPTED', 'DISPUTED', 'RESOLVED']);
export type PayoutStatus = z.infer<typeof payoutStatus>;

export const payoutSummary = z.object({
  id,
  amountMinor: minorUnits,
  method: z.string().nullable(),
  transactionId: z.string().nullable(),
  periodStart: dateOrDateTime.nullable(),
  periodEnd: dateOrDateTime.nullable(),
  status: payoutStatus,
  recordedAt: isoDateTime,
  transferDate: dateOrDateTime.nullable(),
  disputeDeadline: isoDateTime,
  acceptedAt: isoDateTime.nullable(),
});
export type PayoutSummary = z.infer<typeof payoutSummary>;

const sales = z.object({ items: z.array(saleItem), totalsByCurrency: z.array(salesTotals) });

/** GET /teacher/earnings (#84). */
export const earningsDashboard = z.object({
  balances: z.array(currencyBalance),
  pendingSales: sales,
  confirmedSales: sales,
  ledgerEntries: z.array(ledgerEntry),
  payouts: z.array(payoutSummary),
});
export type EarningsDashboard = z.infer<typeof earningsDashboard>;

export const payoutDispute = z.object({
  id,
  reason: z.string(),
  status: z.enum(['OPEN', 'RESOLVED']),
  resolutionNotes: z.string().nullable(),
  createdAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
});
export type PayoutDispute = z.infer<typeof payoutDispute>;

/** GET /teacher/payouts/:id (#85). */
export const payoutDetail = z.object({
  payout: payoutSummary.extend({
    ledgerEntries: z.array(
      z.object({ id, amountMinor: minorUnits, currency: currencyCode, createdAt: isoDateTime }),
    ),
    disputes: z.array(payoutDispute),
  }),
  coveredSales: z.array(
    z.object({
      orderItemId: id,
      paymentReference: z.string(),
      courseTitle: z.string(),
      priceMinor: minorUnits,
      commissionMinor: minorUnits,
      netTeacherMinor: minorUnits,
      currency: currencyCode,
      verifiedAt: isoDateTime.nullable(),
    }),
  ),
});
export type PayoutDetail = z.infer<typeof payoutDetail>;

// ── Profiles ──

export const socialLink = z.object({ label: z.string(), url: z.string() });
export type SocialLink = z.infer<typeof socialLink>;

export const f2fLocation = z.object({
  city: z.string(),
  area: z.string().optional(),
  notes: z.string().optional(),
});
export type F2fLocation = z.infer<typeof f2fLocation>;

const profileBase = z.object({
  teacherId: id,
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  qualifications: z.string().nullable(),
  socialLinks: z.array(socialLink),
  f2fLocations: z.array(f2fLocation),
  photoUrl: z.string().nullable(),
});

/** GET /teacher/profile (#98). */
export const teacherProfile = profileBase.extend({
  isPublished: z.boolean(),
  /** Set while unpublished by an admin (#100). */
  moderation: z.object({ unpublishedAt: isoDateTime, reason: z.string().nullable() }).nullable(),
});
export type TeacherProfile = z.infer<typeof teacherProfile>;

/** GET /teachers/:teacherId (#99, #101). */
export const publicTeacherProfile = profileBase.extend({ courses: catalogueListing });
export type PublicTeacherProfile = z.infer<typeof publicTeacherProfile>;

// ── Quiz authoring (#68–#74) ──

export const questionType = z.enum(['MCQ', 'NUMERIC']);
export type QuestionType = z.infer<typeof questionType>;

export const revealAnswersRule = openEnum([
  'NEVER',
  'AFTER_ATTEMPT',
  'AFTER_PASS',
  'AFTER_FINAL_ATTEMPT',
]);

export const quizQuestion = z.object({
  id,
  type: questionType,
  orderIndex: z.number().int(),
  contentText: z.string(),
  /** Signed, short-lived; null when the question has no image. */
  imageUrl: z.string().nullable(),
  /** MCQ only. */
  options: z.array(z.object({ id, text: z.string(), isCorrect: z.boolean() })).nullable(),
  /** MCQ: the correct option id. NUMERIC: the exact decimal answer. */
  correctAnswer: z.string(),
  /** NUMERIC only: absolute tolerance as a decimal string. */
  numericTolerance: z.string().nullable(),
  numericUnit: z.string().nullable(),
  marks: z.number().int().positive(),
  explanation: z.string().nullable(),
});
export type QuizQuestion = z.infer<typeof quizQuestion>;

/** GET/POST/PATCH /teacher/courses/:id/lessons/:lessonId/quiz: every change returns the quiz. */
export const teacherQuiz = z.object({
  id,
  lessonId: id,
  timeLimitSeconds: z.number().int().positive().nullable(),
  maxAttempts: z.number().int().positive().nullable(),
  isBreakpoint: z.boolean(),
  passingScorePct: z.number().int().min(0).max(100).nullable(),
  revealAnswers: revealAnswersRule,
  createdAt: isoDateTime,
  /** While above 0, the quiz and answered questions cannot be deleted. */
  attemptCount: z.number().int().nonnegative(),
  totalMarks: z.number().nonnegative(),
  questions: z.array(quizQuestion),
});
export type TeacherQuiz = z.infer<typeof teacherQuiz>;

export const quizDeleted = z.object({ lessonId: id, deleted: z.literal(true) });
