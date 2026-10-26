import { Injectable } from '@nestjs/common';
import { CourseStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { ReferenceDataService } from '../../reference-data/services/reference-data.service';
import { AuditLogDao } from '../dao/audit-log.dao';
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

/** What course endpoints return. Controllers import it from here, never from the DAO. */
export type { CourseRecord };

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
    private readonly auditLogDao: AuditLogDao,
    private readonly referenceData: ReferenceDataService,
    private readonly transactions: TransactionService,
  ) {}

  // ── Teacher ───────────────────────────────────────────────────────

  /** #24: a teacher creates a course in DRAFT, owned by them. */
  async createCourse(user: AuthUser, input: CreateCourseInput): Promise<CourseRecord> {
    const scope = teacherScope(user);
    await this.referenceData.assertValidClassification(input);
    return this.courseDao.createCourse(scope, {
      boardId: input.boardId,
      levelId: input.levelId,
      subjectId: input.subjectId,
      syllabusArea: input.syllabusArea ?? null,
      title: input.title,
      description: input.description ?? null,
      status: CourseStatus.DRAFT,
    });
  }

  async listMyCourses(user: AuthUser, query: ListMyCoursesQuery): Promise<CourseRecord[]> {
    return this.courseDao.getCoursesBy(
      teacherScope(user),
      query.status ? { status: query.status } : {},
      query,
    );
  }

  async getMyCourse(user: AuthUser, courseId: string): Promise<CourseRecord> {
    return this.loadCourse(teacherScope(user), courseId);
  }

  /** #25: DRAFT -> PENDING_APPROVAL, optionally with a proposed commission (#30). */
  async submitCourse(
    user: AuthUser,
    courseId: string,
    input: SubmitCourseInput,
  ): Promise<CourseRecord> {
    const scope = teacherScope(user);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideSubmission(course, input.teacherProposedBps);

    return this.applyTransition(scope, course, 'SUBMIT', decision, user.id, {
      teacherProposedBps: decision.teacherProposedBps ?? null,
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────

  /** #28: the review queue (PENDING_APPROVAL by default), oldest first. */
  async listCoursesForReview(
    admin: AuthUser,
    query: ListCoursesForReviewQuery,
  ): Promise<CourseRecord[]> {
    return this.courseDao.getCoursesBy(adminScope(admin), { status: query.status }, query, {
      createdAt: 'asc',
    });
  }

  async getCourseForReview(admin: AuthUser, courseId: string): Promise<CourseRecord> {
    return this.loadCourse(adminScope(admin), courseId);
  }

  /** #29: price + commission (or free), recording who set them and when. */
  async setPricing(
    admin: AuthUser,
    courseId: string,
    input: SetPricingInput,
  ): Promise<CourseRecord> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const pricing = decidePricing(course, input, admin.id, new Date());

    return this.transactions.run(async (tx) => {
      const updated = await this.courseDao.updateCourse(
        scope,
        { id: course.id, expectedStatus: course.status },
        pricing,
        tx,
      );
      if (!updated) throw staleCourse(course);
      await this.auditLogDao.createAuditEntry(
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
  }

  /** #28/#25: PENDING_APPROVAL -> PUBLISHED, only if the publish guard passes (#29). */
  async approveCourse(admin: AuthUser, courseId: string): Promise<CourseRecord> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideApproval(course, new Date());

    return this.applyTransition(scope, course, 'APPROVE', decision, admin.id, {
      publishedAt: decision.publishedAt,
    });
  }

  /** #28: PENDING_APPROVAL -> REJECTED. The reason goes to audit_log (no column on courses). */
  async rejectCourse(
    admin: AuthUser,
    courseId: string,
    input: RejectCourseInput,
  ): Promise<CourseRecord> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideRejection(course, input.reason);

    return this.applyTransition(
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
  }

  // ── Internals ─────────────────────────────────────────────────────

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
      await this.auditLogDao.createAuditEntry(
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
