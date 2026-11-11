import { z } from 'zod';
import { role } from './auth';
import {
  currencyCode,
  dateOrDateTime,
  id,
  isoDateTime,
  minorUnits,
  paged,
  personRef,
} from './common';
import { enrollmentSource, enrollmentStatus } from './enrollment';
import { orderStatus, paymentProof } from './orders';
import {
  currencyBalance,
  ledgerEntryType,
  payoutStatus,
  salesTotals,
  teacherCourse,
} from './teacher';

/** Admin responses: dashboard, users, applications, courses, enrollments, settings, audit, money. */

const account = z.object({ id, email: z.string(), fullName: z.string().nullable() });
const bps = z.number().int().min(0).max(10_000);

// ── Session and role context (#109) ──

export {
  contextRole,
  me as meWithContext,
  type ContextRole,
  type Me as MeWithContext,
} from './auth';

// ── Dashboard (#102) ──

export const adminDashboard = z.object({
  generatedAt: isoDateTime,
  queues: z.object({
    coursesPendingApproval: z.number().int().nonnegative(),
    teacherApplicationsOpen: z.number().int().nonnegative(),
    paymentVerificationsPending: z.number().int().nonnegative().nullable(),
    payoutConcerns: z.number().int().nonnegative().nullable(),
  }),
  needsAttention: z.number().int().nonnegative(),
  today: z.object({ since: isoDateTime, enrollmentsGranted: z.number().int().nonnegative() }),
});
export type AdminDashboard = z.infer<typeof adminDashboard>;

// ── Users (#15, #103) ──

export const userStatus = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatus = z.infer<typeof userStatus>;

export const adminUser = z.object({
  id,
  email: z.string(),
  fullName: z.string().nullable(),
  isEmailVerified: z.boolean(),
  status: userStatus,
  roles: z.array(role),
  mfaEnabled: z.boolean(),
  guardianName: z.string().nullable(),
  guardianEmail: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  createdAt: isoDateTime,
  lastLoginAt: isoDateTime.nullable(),
});
export type AdminUser = z.infer<typeof adminUser>;

export const adminEnrollment = z.object({
  id,
  status: enrollmentStatus,
  source: enrollmentSource,
  paymentChannel: z.string().nullable(),
  grantedAt: isoDateTime,
  expiresAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
  completionPercent: z.number().min(0).max(100).optional(),
  student: z.object({ id, fullName: z.string().nullable(), email: z.string() }),
  course: z.object({ id, title: z.string(), teacherId: id }),
  grantedBy: personRef.nullable(),
});
export type AdminEnrollment = z.infer<typeof adminEnrollment>;

export const adminCourse = teacherCourse.extend({
  teacher: account,
  pricedAt: isoDateTime.nullable().optional(),
});
export type AdminCourse = z.infer<typeof adminCourse>;

export const adminCourses = z.array(adminCourse);

export const adminUserOverview = z.object({
  user: adminUser,
  enrollments: paged(adminEnrollment),
  coursesTaught: z
    .object({ items: z.array(adminCourse), total: z.number().int().nonnegative() })
    .nullable(),
});
export type AdminUserOverview = z.infer<typeof adminUserOverview>;

export const sent = z.object({ sent: z.boolean() });

// ── Teacher applications (#20, #21) ──

export const applicationStatus = z.enum(['SUBMITTED', 'UNDER_REVIEW', 'REJECTED', 'HIRED']);
export type ApplicationStatus = z.infer<typeof applicationStatus>;

export const teacherApplication = z.object({
  id,
  applicantName: z.string(),
  applicantEmail: z.string(),
  applicantPhone: z.string().nullable(),
  subjects: z.string().nullable(),
  status: applicationStatus,
  reviewedAt: isoDateTime.nullable(),
  reviewNotes: z.string().nullable(),
  purgeAfter: dateOrDateTime.nullable(),
  createdAt: isoDateTime,
  reviewedBy: account.nullable(),
  user: account.extend({ status: userStatus }).nullable(),
});
export type TeacherApplication = z.infer<typeof teacherApplication>;

export const signedDownload = z.object({ url: z.string(), expiresInSeconds: z.number() });

// ── Platform settings (#8) and audit log (#108) ──

const settingValue = z.union([z.number(), z.string(), z.boolean()]);

export const platformSetting = z.object({
  key: z.string(),
  value: settingValue,
  defaultValue: settingValue,
  description: z.string(),
  isDefault: z.boolean(),
  updatedAt: isoDateTime.nullable(),
  updatedBy: z.object({ id, email: z.string() }).nullable(),
});
export type PlatformSetting = z.infer<typeof platformSetting>;

export const platformSettings = z.array(platformSetting);

export const auditEntry = z.object({
  id,
  actorUserId: id.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  details: z.unknown(),
  ipAddress: z.string().nullable(),
  createdAt: isoDateTime,
  actor: z.object({ id, email: z.string() }).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;

// ── Payment verification and orders (#63–#67) ──

export const mismatchAction = z.enum(['CONFIRM_ANYWAY', 'REQUEST_TOP_UP', 'REJECT']);
export type MismatchAction = z.infer<typeof mismatchAction>;

export const rejectionReason = z.enum([
  'NO_PAYMENT_RECEIVED',
  'AMOUNT_SHORT',
  'INVALID_TRANSACTION_ID',
  'DUPLICATE_TRANSACTION',
  'OTHER',
]);
export type RejectionReason = z.infer<typeof rejectionReason>;

export const duplicateTransactionIdWarning = z.object({
  transactionId: z.string(),
  conflictingOrderIds: z.array(id),
  conflictingPaymentReferences: z.array(z.string()),
  message: z.string(),
});
export type DuplicateTransactionIdWarning = z.infer<typeof duplicateTransactionIdWarning>;

export const verificationQueueEntry = z.object({
  orderId: id,
  paymentReference: z.string(),
  student: account,
  totalMinor: minorUnits,
  currency: currencyCode,
  items: z.array(
    z.object({
      courseTitle: z.string(),
      teacherName: z.string().nullable(),
      priceMinor: minorUnits,
    }),
  ),
  proofs: z.array(paymentProof),
  waitingSince: isoDateTime.nullable(),
  waitingMinutes: z.number().nonnegative().nullable(),
  overTurnaround: z.boolean(),
  claimed: z.object({
    claimedMinor: minorUnits.nullable(),
    differenceMinor: minorUnits.nullable(),
    mismatch: z.boolean(),
  }),
  duplicateTransactionIdWarnings: z.array(duplicateTransactionIdWarning),
});
export type VerificationQueueEntry = z.infer<typeof verificationQueueEntry>;

export const queueMetrics = z.object({
  queueSize: z.number().int().nonnegative(),
  turnaroundHours: z.number().nonnegative(),
  oldestWaitingSince: isoDateTime.nullable(),
  oldestWaitingMinutes: z.number().nonnegative().nullable(),
  oldestOverTurnaround: z.boolean(),
  overTurnaroundCount: z.number().int().nonnegative(),
});
export type QueueMetrics = z.infer<typeof queueMetrics>;

export const paymentDecisionResult = z.object({
  orderId: id,
  paymentReference: z.string(),
  status: orderStatus,
  outcome: z.string(),
  totalMinor: minorUnits,
  amountReceivedMinor: minorUnits.nullable(),
  differenceMinor: minorUnits.nullable(),
  mismatchAction: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  enrollmentsGranted: z.number().int().nonnegative(),
  ledgerEntriesWritten: z.number().int().nonnegative(),
});
export type PaymentDecisionResult = z.infer<typeof paymentDecisionResult>;

export const adminOrder = z.object({
  id,
  studentId: id,
  paymentReference: z.string(),
  totalMinor: minorUnits,
  currency: currencyCode,
  status: orderStatus,
  expiresAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  verifiedAt: isoDateTime.nullable(),
  student: account,
  items: z.array(
    z.object({
      id,
      courseId: id,
      teacherId: id,
      priceMinor: minorUnits,
      commissionRateBps: bps,
      commissionMinor: minorUnits,
      netTeacherMinor: minorUnits,
      course: z.object({ id, title: z.string() }),
      teacher: account,
    }),
  ),
  proofs: z.array(paymentProof),
  verifications: z.array(
    z.object({
      id,
      proofId: id.nullable(),
      outcome: z.string(),
      amountReceivedMinor: minorUnits.nullable(),
      valueDate: dateOrDateTime.nullable(),
      mismatchAction: z.string().nullable(),
      rejectionReason: z.string().nullable(),
      notes: z.string().nullable(),
      verifiedAt: isoDateTime,
    }),
  ),
  duplicateTransactionIdWarnings: z.array(duplicateTransactionIdWarning),
});
export type AdminOrder = z.infer<typeof adminOrder>;

// ── Ledger: refunds and adjustments (#82, #83) ──

export const adminLedgerEntry = z.object({
  id,
  teacherId: id,
  type: ledgerEntryType,
  amountMinor: minorUnits,
  currency: currencyCode,
  orderItemId: id.nullable(),
  payoutId: id.nullable(),
  refundId: id.nullable(),
  description: z.string(),
  createdById: id.nullable(),
  createdAt: isoDateTime,
});
export type AdminLedgerEntry = z.infer<typeof adminLedgerEntry>;

export const refundResult = z.object({
  orderId: id,
  status: orderStatus,
  enrollmentsRevoked: z.number().int().nonnegative(),
});

export const adjustmentResult = z.object({ entry: adminLedgerEntry, balance: currencyBalance });

// ── Payouts and concerns (#85–#89) ──

export const adminPayoutDispute = z.object({
  id,
  payoutId: id,
  teacherId: id,
  reason: z.string(),
  status: z.enum(['OPEN', 'RESOLVED']),
  resolutionNotes: z.string().nullable(),
  adjustmentLedgerId: id.nullable(),
  createdAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
  resolvedBy: account.nullable(),
});
export type AdminPayoutDispute = z.infer<typeof adminPayoutDispute>;

export const adminPayout = z.object({
  id,
  teacherId: id,
  amountMinor: minorUnits,
  method: z.string().nullable(),
  transactionId: z.string(),
  periodStart: dateOrDateTime.nullable(),
  periodEnd: dateOrDateTime.nullable(),
  status: payoutStatus,
  recordedAt: isoDateTime,
  transferDate: dateOrDateTime,
  disputeDeadline: isoDateTime,
  acceptedAt: isoDateTime.nullable(),
  teacher: account.optional(),
  recordedBy: account.nullable().optional(),
  ledgerEntries: z
    .array(
      z.object({
        id,
        amountMinor: minorUnits,
        currency: currencyCode,
        description: z.string(),
        createdAt: isoDateTime,
      }),
    )
    .optional(),
  disputes: z.array(adminPayoutDispute).optional(),
});
export type AdminPayout = z.infer<typeof adminPayout>;

export const coveredSale = z.object({
  orderItemId: id,
  orderId: id,
  paymentReference: z.string(),
  courseTitle: z.string(),
  priceMinor: minorUnits,
  commissionMinor: minorUnits,
  netTeacherMinor: minorUnits,
  currency: currencyCode,
  verifiedAt: isoDateTime.nullable(),
});
export type CoveredSale = z.infer<typeof coveredSale>;

export const payoutWithSales = z.object({
  payout: adminPayout,
  coveredSales: z.array(coveredSale),
});

export const payoutRecorded = z.object({ payout: adminPayout, remainingBalance: currencyBalance });

export const payoutOnly = z.object({ payout: adminPayout });

export const openConcern = z.object({
  id,
  payoutId: id,
  teacherId: id,
  reason: z.string(),
  status: z.literal('OPEN'),
  createdAt: isoDateTime,
  ageHours: z.number().nonnegative(),
  ageDays: z.number().nonnegative(),
  teacher: account,
  payout: z.object({
    id,
    amountMinor: minorUnits,
    transactionId: z.string(),
    status: payoutStatus,
    transferDate: dateOrDateTime,
    disputeDeadline: isoDateTime,
    ledgerEntries: z.array(z.object({ currency: currencyCode })),
  }),
});
export type OpenConcern = z.infer<typeof openConcern>;

export const openConcernsSummary = z.object({
  generatedAt: isoDateTime,
  count: z.number().int().nonnegative(),
  oldestAgeHours: z.number().nonnegative().nullable(),
  items: z.array(openConcern),
});
export type OpenConcernsSummary = z.infer<typeof openConcernsSummary>;

// ── Finance (#104–#106) ──

export const currencyFinancialSummary = z.object({
  currency: currencyCode,
  confirmedSalesCount: z.number().int().nonnegative(),
  confirmedSalesGrossMinor: minorUnits,
  commissionRetainedMinor: minorUnits,
  teacherEarningsMinor: minorUnits,
  refundsCount: z.number().int().nonnegative(),
  refundsMinor: minorUnits,
  teacherRefundDebitsMinor: minorUnits,
  adjustmentsMinor: minorUnits,
  payoutsCount: z.number().int().nonnegative(),
  payoutsMinor: minorUnits,
  periodNetLiabilityChangeMinor: minorUnits,
  outstandingLiabilityMinor: minorUnits,
});
export type CurrencyFinancialSummary = z.infer<typeof currencyFinancialSummary>;

export const financialSummary = z.object({
  period: z.object({ from: dateOrDateTime.nullable(), to: dateOrDateTime.nullable() }),
  currencies: z.array(currencyFinancialSummary),
});
export type FinancialSummary = z.infer<typeof financialSummary>;

export const teacherSale = z.object({
  id,
  orderId: id,
  paymentReference: z.string(),
  orderStatus: z.string(),
  currency: currencyCode,
  courseTitle: z.string(),
  priceMinor: minorUnits,
  commissionRateBps: bps,
  commissionMinor: minorUnits,
  netTeacherMinor: minorUnits,
  orderCreatedAt: isoDateTime,
  orderVerifiedAt: isoDateTime.nullable(),
});
export type TeacherSale = z.infer<typeof teacherSale>;

const salesGroup = z.object({
  items: z.array(teacherSale),
  totalsByCurrency: z.array(salesTotals),
});
const counted = <T extends z.ZodType>(item: T) =>
  z.object({ count: z.number().int().nonnegative(), items: z.array(item) });

/** One teacher in the payout run (GET /admin/payouts/run). */
export const payoutRunRow = z.object({
  teacherId: id,
  name: z.string(),
  balances: z.array(currencyBalance),
  lastPayout: z
    .object({ transferDate: dateOrDateTime.nullable(), status: payoutStatus })
    .nullable(),
  status: z.enum(['DUE', 'DISPUTED', 'CLEAR']),
});
export type PayoutRunRow = z.infer<typeof payoutRunRow>;

export const payoutRun = z.object({
  items: z.array(payoutRunRow),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  /** Owed to every active teacher together, per currency. */
  totalsOwed: z.array(z.object({ currency: currencyCode, minor: minorUnits })),
});
export type PayoutRun = z.infer<typeof payoutRun>;

export const teacherStatement = z.object({
  teacher: adminUser,
  balances: z.array(currencyBalance),
  sales: z.object({ pending: salesGroup, confirmed: salesGroup }),
  refunds: counted(adminLedgerEntry),
  adjustments: counted(adminLedgerEntry),
  payouts: counted(adminPayout),
  ledger: counted(adminLedgerEntry),
});
export type TeacherStatement = z.infer<typeof teacherStatement>;
