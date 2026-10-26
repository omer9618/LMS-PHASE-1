import { Injectable } from '@nestjs/common';
import { CourseStatus, EnrollmentStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { ReferenceDataService } from '../../reference-data/services/reference-data.service';
import { CourseDao, CourseRecord, CourseUpdateData } from '../dao/course.dao';
import {
  COURSE_TRANSITIONS,
  CourseAction,
  CourseStatusValue,
  decideApproval,
  decidePricing,
  decideRejection,
  decideSubmission,
} from '../domain/course.rules';
import type {
  CreateCourseInput,
  ListCoursesForReviewQuery,
  ListMyCoursesQuery,
  RejectCourseInput,
  SetPricingInput,
  SubmitCourseInput,
} from '../schemas/course.schema';

/**
 * What course endpoints return. Controllers import it from here, never from the DAO.
 * `rejectionReason` is set when the course is REJECTED (#28); teachers read it to see why.
 */
export type CourseView = CourseRecord & { rejectionReason: string | null };

/** audit_log.action values written by this service. */
export const COURSE_AUDIT_ACTIONS = {
  SUBMIT: 'COURSE_SUBMITTED',
  APPROVE: 'COURSE_APPROVED',
  REJECT: 'COURSE_REJECTED',
  PRICE: 'COURSE_PRICED',
} as const;

@Injectable()
export class CourseService {
  constructor(
    private readonly courseDao: CourseDao,
    private readonly audit: AuditService,
    private readonly referenceData: ReferenceDataService,
    private readonly transactions: TransactionService,
  ) {}

  // ── Teacher ───────────────────────────────────────────────────────

  /** #24: a teacher creates a course in DRAFT, owned by them. */
  async createCourse(user: AuthUser, input: CreateCourseInput): Promise<CourseView> {
    const scope = teacherScope(user);
    await this.referenceData.assertValidClassification(input);
    const course = await this.courseDao.createCourse(scope, {
      boardId: input.boardId,
      levelId: input.levelId,
      subjectId: input.subjectId,
      syllabusArea: input.syllabusArea ?? null,
      title: input.title,
      description: input.description ?? null,
      status: CourseStatus.DRAFT,
    });
    return this.toView(course);
  }

  async listMyCourses(user: AuthUser, query: ListMyCoursesQuery): Promise<CourseView[]> {
    const courses = await this.courseDao.getCoursesBy(
      teacherScope(user),
      query.status ? { status: query.status } : {},
      query,
    );
    return this.toViews(courses);
  }

  async getMyCourse(user: AuthUser, courseId: string): Promise<CourseView> {
    return this.toView(await this.loadCourse(teacherScope(user), courseId));
  }

  /** #25: DRAFT -> PENDING_APPROVAL, optionally with a proposed commission (#30). */
  async submitCourse(
    user: AuthUser,
    courseId: string,
    input: SubmitCourseInput,
  ): Promise<CourseView> {
    const scope = teacherScope(user);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideSubmission(course, input.teacherProposedBps);

    const updated = await this.applyTransition(scope, course, 'SUBMIT', decision, user.id, {
      teacherProposedBps: decision.teacherProposedBps ?? null,
    });
    return this.toView(updated);
  }

  // ── Admin ─────────────────────────────────────────────────────────

  /** #28: the review queue (PENDING_APPROVAL by default), oldest first. */
  async listCoursesForReview(
    admin: AuthUser,
    query: ListCoursesForReviewQuery,
  ): Promise<CourseView[]> {
    const courses = await this.courseDao.getCoursesBy(
      adminScope(admin),
      { status: query.status },
      query,
      { createdAt: 'asc' },
    );
    return this.toViews(courses);
  }

  async getCourseForReview(admin: AuthUser, courseId: string): Promise<CourseView> {
    return this.toView(await this.loadCourse(adminScope(admin), courseId));
  }

  /** #29: price + commission (or free), recording who set them and when. */
  async setPricing(admin: AuthUser, courseId: string, input: SetPricingInput): Promise<CourseView> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const pricing = decidePricing(course, input, admin.id, new Date());

    const priced = await this.transactions.run(async (tx) => {
      const updated = await this.courseDao.updateCourse(
        scope,
        { id: course.id, expectedStatus: course.status },
        pricing,
        tx,
      );
      if (!updated) throw staleCourse(course);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: COURSE_AUDIT_ACTIONS.PRICE,
          entityType: 'course',
          entityId: course.id,
          details: {
            isFree: pricing.isFree,
            // JSON has no bigint: money is stored as a string of minor units.
            priceMinor: pricing.priceMinor?.toString() ?? null,
            currency: pricing.currency,
            commissionRateBps: pricing.commissionRateBps,
          },
        },
        tx,
      );
      return updated;
    });
    return this.toView(priced);
  }

  /** #28/#25: PENDING_APPROVAL -> PUBLISHED, only if the publish guard passes (#29). */
  async approveCourse(admin: AuthUser, courseId: string): Promise<CourseView> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideApproval(course, new Date());

    const updated = await this.applyTransition(scope, course, 'APPROVE', decision, admin.id, {
      publishedAt: decision.publishedAt,
    });
    return this.toView(updated);
  }

  /**
   * #28: PENDING_APPROVAL -> REJECTED, which is final (no resubmission). The reason is stored in
   * audit_log (courses has no reason column) and returned to the teacher as `rejectionReason`.
   */
  async rejectCourse(
    admin: AuthUser,
    courseId: string,
    input: RejectCourseInput,
  ): Promise<CourseView> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideRejection(course, input.reason);

    const updated = await this.applyTransition(
      scope,
      course,
      'REJECT',
      decision,
      admin.id,
      {},
      {
        reason: decision.reason,
      },
    );
    return { ...updated, rejectionReason: decision.reason };
  }

  // ── For other modules ─────────────────────────────────────────────

  /**
   * #22: courses a teacher is committed to, meaning students currently hold an active enrollment.
   * Teacher deactivation is blocked while this is above zero.
   */
  countCommittedCourses(teacherId: string, tx?: TransactionClient): Promise<number> {
    return this.courseDao.countCoursesBy(
      { teacherId },
      { enrollments: { some: { status: EnrollmentStatus.ACTIVE } } },
      tx,
    );
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async toView(course: CourseRecord): Promise<CourseView> {
    const [view] = await this.toViews([course]);
    return view;
  }

  /**
   * Attaches rejection reasons. Courses here were already loaded through the caller's scope, so
   * the audit lookup is restricted to ids the caller may see. One query, and only if any course
   * is REJECTED.
   */
  private async toViews(courses: CourseRecord[]): Promise<CourseView[]> {
    const rejectedIds = courses.filter((c) => c.status === CourseStatus.REJECTED).map((c) => c.id);
    if (rejectedIds.length === 0) return courses.map((c) => ({ ...c, rejectionReason: null }));

    const rejections = await this.audit.latestFor(
      'course',
      COURSE_AUDIT_ACTIONS.REJECT,
      rejectedIds,
    );

    return courses.map((course) => {
      const reason = (rejections.get(course.id)?.details as { reason?: unknown } | null)?.reason;
      return { ...course, rejectionReason: typeof reason === 'string' ? reason : null };
    });
  }

  /** Not-found and not-yours look identical, so other teachers' course ids are not revealed. */
  private async loadCourse(scope: TeacherScope, courseId: string): Promise<CourseRecord> {
    const course = await this.courseDao.getCourseBy(scope, { id: courseId });
    if (!course) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });
    return course;
  }

  /**
   * Persists a status change decided by the domain rules, plus its audit entry, atomically.
   * The update only matches while the course still has the status the decision was made from.
   */
  private applyTransition(
    scope: TeacherScope,
    course: CourseRecord,
    action: CourseAction,
    decision: { status: CourseStatusValue },
    actorUserId: string,
    extra: CourseUpdateData,
    auditDetails: Record<string, string> = {},
  ): Promise<CourseRecord> {
    const details: Prisma.InputJsonObject = {
      from: course.status,
      to: decision.status,
      ...auditDetails,
    };
    return this.transactions.run(async (tx) => {
      const updated = await this.courseDao.updateCourse(
        scope,
        { id: course.id, expectedStatus: COURSE_TRANSITIONS[action].from },
        { ...extra, status: decision.status },
        tx,
      );
      if (!updated) throw staleCourse(course);
      await this.audit.record(
        {
          actorUserId,
          action: COURSE_AUDIT_ACTIONS[action],
          entityType: 'course',
          entityId: course.id,
          details,
        },
        tx,
      );
      return updated;
    });
  }
}

function staleCourse(course: CourseRecord): AppException {
  return new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
    id: course.id,
    reason: 'The course changed while this request was in progress. Reload and try again.',
  });
}
