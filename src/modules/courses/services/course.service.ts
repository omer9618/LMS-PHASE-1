import { Injectable } from '@nestjs/common';
import { CourseStatus, EnrollmentStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { EmailService } from '../../email/services/email.service';
import { ReferenceDataService } from '../../reference-data/services/reference-data.service';
import { CourseDao, CourseRecord, CourseUpdateData } from '../dao/course.dao';
import {
  assertDeletable,
  assertDetailsEditable,
  assertSubmittable,
  COURSE_TRANSITIONS,
  CourseAction,
  CourseStatusValue,
  decideApproval,
  decideArchive,
  decidePricing,
  decideRejection,
  decideSubmission,
  decideUnpublish,
  Editor,
} from '../domain/course.rules';
import type {
  ArchiveCourseInput,
  CreateCourseInput,
  ListCoursesForReviewQuery,
  ListMyCoursesQuery,
  RejectCourseInput,
  SetPricingInput,
  SubmitCourseInput,
  UnpublishCourseInput,
  UpdateCourseDetailsInput,
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
  UNPUBLISH: 'COURSE_UNPUBLISHED',
  ARCHIVE: 'COURSE_ARCHIVED',
  PRICE: 'COURSE_PRICED',
  EDIT: 'COURSE_DETAILS_EDITED',
  ENROLLMENT_TOGGLE: 'COURSE_ENROLLMENT_TOGGLED',
  DELETE: 'COURSE_DELETED',
} as const;

@Injectable()
export class CourseService {
  constructor(
    private readonly courseDao: CourseDao,
    private readonly audit: AuditService,
    private readonly referenceData: ReferenceDataService,
    private readonly transactions: TransactionService,
    private readonly email: EmailService,
  ) {}

  // ── Teacher ───────────────────────────────────────────────────────

  /** #24, #33: a teacher creates a course in DRAFT, owned by them. */
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
      progressionMode: input.progressionMode,
      audienceType: input.audienceType,
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

  /** #26: teachers edit details only while drafting. */
  async updateMyCourse(
    user: AuthUser,
    courseId: string,
    input: UpdateCourseDetailsInput,
  ): Promise<CourseView> {
    return this.updateDetails(user, teacherScope(user), courseId, input, 'TEACHER');
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

  /** #26: archive own course: hidden and closed to new enrollments; students keep access. */
  async archiveMyCourse(user: AuthUser, courseId: string): Promise<CourseView> {
    return this.archive(user, teacherScope(user), courseId, undefined);
  }

  /** #26: hard delete, refused once anyone has enrolled in or ordered the course. */
  async deleteMyCourse(user: AuthUser, courseId: string): Promise<{ deleted: true }> {
    const scope = teacherScope(user);
    const course = await this.loadCourse(scope, courseId);
    await this.transactions.run(async (tx) => {
      assertDeletable(await this.courseDao.countCourseDependents(scope, course.id, tx));
      if (!(await this.courseDao.deleteCourse(scope, course.id, tx))) throw staleCourse(course);
      await this.audit.record(
        {
          actorUserId: user.id,
          action: COURSE_AUDIT_ACTIONS.DELETE,
          entityType: 'course',
          entityId: course.id,
          details: { title: course.title, status: course.status },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  /** #32: open or close enrollment, independent of publication; enrolled students unaffected. */
  async setMyCourseEnrollment(
    user: AuthUser,
    courseId: string,
    open: boolean,
  ): Promise<CourseView> {
    return this.setEnrollmentOpen(user, teacherScope(user), courseId, open);
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

  /** #26: admins can correct details, including on a published course. */
  async updateCourseAsAdmin(
    admin: AuthUser,
    courseId: string,
    input: UpdateCourseDetailsInput,
  ): Promise<CourseView> {
    return this.updateDetails(admin, adminScope(admin), courseId, input, 'ADMIN');
  }

  /** #29 price + commission (or free), and #31 changes after publication. Who and when recorded. */
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
            status: course.status,
            from: priceDetails(course),
            // JSON has no bigint: money is stored as a string of minor units.
            to: priceDetails(pricing),
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
    await this.notifyTeacher(updated, 'COURSE_APPROVED');
    return this.toView(updated);
  }

  /**
   * #28: PENDING_APPROVAL -> REJECTED, which is final (no resubmission). The reason is stored in
   * audit_log (courses has no reason column), emailed to the teacher and returned as
   * `rejectionReason`.
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
    await this.notifyTeacher(updated, 'COURSE_REJECTED', decision.reason);
    return { ...updated, rejectionReason: decision.reason };
  }

  /** #28: PUBLISHED -> DRAFT with a reason; the teacher is notified and may resubmit. */
  async unpublishCourse(
    admin: AuthUser,
    courseId: string,
    input: UnpublishCourseInput,
  ): Promise<CourseView> {
    const scope = adminScope(admin);
    const course = await this.loadCourse(scope, courseId);
    const decision = decideUnpublish(course, input.reason);

    const updated = await this.applyTransition(
      scope,
      course,
      'UNPUBLISH',
      decision,
      admin.id,
      { publishedAt: decision.publishedAt },
      { reason: decision.reason },
    );
    await this.notifyTeacher(updated, 'COURSE_UNPUBLISHED', decision.reason);
    return this.toView(updated);
  }

  async archiveCourseAsAdmin(
    admin: AuthUser,
    courseId: string,
    input: ArchiveCourseInput,
  ): Promise<CourseView> {
    return this.archive(admin, adminScope(admin), courseId, input.reason);
  }

  async setCourseEnrollmentAsAdmin(
    admin: AuthUser,
    courseId: string,
    open: boolean,
  ): Promise<CourseView> {
    return this.setEnrollmentOpen(admin, adminScope(admin), courseId, open);
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

  /** Loads a course in the caller's scope for sibling services (sections, lessons). 404 if not. */
  loadInScope(scope: TeacherScope, courseId: string): Promise<CourseRecord> {
    return this.loadCourse(scope, courseId);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private async updateDetails(
    actor: AuthUser,
    scope: TeacherScope,
    courseId: string,
    input: UpdateCourseDetailsInput,
    editor: Editor,
  ): Promise<CourseView> {
    const course = await this.loadCourse(scope, courseId);
    assertDetailsEditable(course.status, editor);
    if (input.boardId && input.levelId && input.subjectId) {
      await this.referenceData.assertValidClassification({
        boardId: input.boardId,
        levelId: input.levelId,
        subjectId: input.subjectId,
      });
    }

    const updated = await this.transactions.run(async (tx) => {
      const result = await this.courseDao.updateCourse(
        scope,
        { id: course.id, expectedStatus: course.status },
        input,
        tx,
      );
      if (!result) throw staleCourse(course);
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: COURSE_AUDIT_ACTIONS.EDIT,
          entityType: 'course',
          entityId: course.id,
          details: { editor, fields: Object.keys(input) },
        },
        tx,
      );
      return result;
    });
    return this.toView(updated);
  }

  private async archive(
    actor: AuthUser,
    scope: TeacherScope,
    courseId: string,
    reason: string | undefined,
  ): Promise<CourseView> {
    const course = await this.loadCourse(scope, courseId);
    const decision = decideArchive(course, new Date());
    const updated = await this.applyTransition(
      scope,
      course,
      'ARCHIVE',
      decision,
      actor.id,
      { archivedAt: decision.archivedAt, isEnrollmentOpen: decision.isEnrollmentOpen },
      reason ? { reason } : {},
    );
    return this.toView(updated);
  }

  private async setEnrollmentOpen(
    actor: AuthUser,
    scope: TeacherScope,
    courseId: string,
    open: boolean,
  ): Promise<CourseView> {
    const course = await this.loadCourse(scope, courseId);
    if (open && course.status === CourseStatus.ARCHIVED) {
      throw new AppException(ErrorCode.COURSE_LOCKED, { status: course.status }, undefined, {
        message: 'An archived course cannot reopen enrollment',
      });
    }
    if (course.isEnrollmentOpen === open) return this.toView(course);

    const updated = await this.transactions.run(async (tx) => {
      const result = await this.courseDao.updateCourse(
        scope,
        { id: course.id },
        { isEnrollmentOpen: open },
        tx,
      );
      if (!result) throw staleCourse(course);
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: COURSE_AUDIT_ACTIONS.ENROLLMENT_TOGGLE,
          entityType: 'course',
          entityId: course.id,
          details: { open },
        },
        tx,
      );
      return result;
    });
    return this.toView(updated);
  }

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
   * The update only matches while the course still has a status the decision allows.
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
      if (action === 'SUBMIT') {
        // #34: a course must carry a demo (a free-preview video lesson) before review.
        assertSubmittable({
          freePreviewVideoLessons: await this.courseDao.countFreePreviewVideoLessons(
            scope,
            course.id,
            tx,
          ),
        });
      }
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

  /** Emails the course's teacher after a decision has committed (#28, #111). */
  private async notifyTeacher(
    course: CourseRecord,
    template: 'COURSE_APPROVED' | 'COURSE_REJECTED' | 'COURSE_UNPUBLISHED',
    reason?: string,
  ): Promise<void> {
    const courseUrl = this.email.appUrl(`/teacher/courses/${course.id}`);
    if (template === 'COURSE_APPROVED') {
      await this.email.send(course.teacher.email, template, {
        courseTitle: course.title,
        courseUrl,
      });
    } else {
      await this.email.send(course.teacher.email, template, {
        courseTitle: course.title,
        reason: reason ?? '',
        courseUrl,
      });
    }
  }
}

function priceDetails(p: {
  isFree: boolean;
  priceMinor: bigint | null;
  currency: string | null;
  commissionRateBps: number | null;
}): Prisma.InputJsonObject {
  return {
    isFree: p.isFree,
    priceMinor: p.priceMinor?.toString() ?? null,
    currency: p.currency,
    commissionRateBps: p.commissionRateBps,
  };
}

function staleCourse(course: CourseRecord): AppException {
  return new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
    id: course.id,
    reason: 'The course changed while this request was in progress. Reload and try again.',
  });
}
