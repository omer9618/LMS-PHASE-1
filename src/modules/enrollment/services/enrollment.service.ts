import { Injectable } from '@nestjs/common';
import { EnrollmentSource, EnrollmentStatus, Prisma, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService, Paged } from '../../audit/services/audit.service';
import { UserAdminService } from '../../auth/services/user-admin.service';
import { CourseService } from '../../courses/services/course.service';
import { EnrollmentDao, EnrollmentRecord, StudentEnrollmentRecord } from '../dao/enrollment.dao';
import {
  accessState,
  AccessState,
  assertRevocable,
  completionPercent,
  decideAdminGrant,
  decideFreeEnrollment,
  EnrollableCourseFacts,
} from '../domain/enrollment.rules';
import type {
  AdminGrantInput,
  ListEnrollmentsQuery,
  RevokeEnrollmentInput,
} from '../schemas/enrollment.schema';

export type EnrollmentView = EnrollmentRecord & { completionPercent?: number };

export interface DashboardEntry extends Omit<StudentEnrollmentRecord, 'status'> {
  status: EnrollmentStatus;
  /** ACTIVE, EXPIRED (by date or status) or REVOKED, as the student experiences it. */
  access: AccessState;
  completionPercent: number;
  completedLessons: number;
  totalLessons: number;
}

/** A confirmed order line to enroll, used by payment confirmation (#48). */
export interface PurchasedCourse {
  courseId: string;
  orderItemId: string;
}

/**
 * Enrollment (#46â€“#52). One row per student per course; who granted it, how, and when are
 * recorded on the row, and every admin action is audited.
 */
@Injectable()
export class EnrollmentService {
  constructor(
    private readonly enrollmentDao: EnrollmentDao,
    private readonly courseService: CourseService,
    private readonly userAdmin: UserAdminService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  /** #47: any signed-in user enrolls in a free course, without payment. Idempotent. */
  async enrollFree(user: AuthUser, courseId: string): Promise<EnrollmentView> {
    const course = await this.loadCourseFacts(courseId);
    return this.transactions.run(async (tx) => {
      const existing = await this.enrollmentDao.getEnrollmentState(user.id, courseId, tx);
      const decision = decideFreeEnrollment(course, user.id, existing, new Date());
      if (decision === 'ALREADY_ACTIVE' && existing) return this.loadEnrollment(existing.id);
      return this.enrollmentDao.upsertEnrollment(
        user.id,
        courseId,
        { source: EnrollmentSource.FREE, grantedAt: new Date() },
        tx,
      );
    });
  }

  /**
   * #48: grants the courses of a confirmed order, inside the confirmation's transaction.
   * Idempotent: an already-active enrollment is left as it is, so a retry grants nothing twice.
   */
  async grantPurchased(
    studentId: string,
    courses: PurchasedCourse[],
    tx: TransactionClient,
  ): Promise<number> {
    let granted = 0;
    const now = new Date();
    for (const item of courses) {
      const existing = await this.enrollmentDao.getEnrollmentState(studentId, item.courseId, tx);
      if (accessState(existing, now) === 'ACTIVE') continue;
      await this.enrollmentDao.upsertEnrollment(
        studentId,
        item.courseId,
        { source: EnrollmentSource.PURCHASE, orderItemId: item.orderItemId, grantedAt: now },
        tx,
      );
      granted += 1;
    }
    return granted;
  }

  /** #49: admin grants access against an offline payment, recording channel and reason. */
  async adminGrant(admin: AuthUser, input: AdminGrantInput): Promise<EnrollmentView> {
    adminScope(admin);
    const student = await this.userAdmin.findUserByEmail(admin, input.studentEmail);
    if (!student || student.status !== UserStatus.ACTIVE) {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'student', email: input.studentEmail });
    }
    const course = await this.loadCourseFacts(input.courseId);

    return this.transactions.run(async (tx) => {
      const existing = await this.enrollmentDao.getEnrollmentState(student.id, input.courseId, tx);
      decideAdminGrant(course, existing, new Date());
      const enrollment = await this.enrollmentDao.upsertEnrollment(
        student.id,
        input.courseId,
        {
          source: EnrollmentSource.ADMIN_GRANT,
          grantedById: admin.id,
          paymentChannel: input.paymentChannel,
          expiresAt: input.expiresAt ?? null,
          grantedAt: new Date(),
        },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'ENROLLMENT_GRANTED',
          entityType: 'enrollment',
          entityId: enrollment.id,
          details: {
            studentId: student.id,
            courseId: input.courseId,
            paymentChannel: input.paymentChannel,
            reason: input.reason,
            expiresAt: input.expiresAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return enrollment;
    });
  }

  /** Admin revokes access (refunds #82 call this too), with a reason. */
  async adminRevoke(
    admin: AuthUser,
    enrollmentId: string,
    input: RevokeEnrollmentInput,
    tx?: TransactionClient,
  ): Promise<EnrollmentView> {
    adminScope(admin);
    const run = async (t: TransactionClient) => {
      const enrollment = await this.loadEnrollment(enrollmentId, t);
      assertRevocable(enrollment);
      const updated = await this.enrollmentDao.updateEnrollment(
        enrollment.id,
        { status: EnrollmentStatus.REVOKED, revokedAt: new Date() },
        t,
      );
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'ENROLLMENT_REVOKED',
          entityType: 'enrollment',
          entityId: enrollment.id,
          details: { from: enrollment.status, reason: input.reason },
        },
        t,
      );
      return updated;
    };
    return tx ? run(tx) : this.transactions.run(run);
  }

  /**
   * #82 (FR-7.14): revokes the student's active enrollments for the courses on a refunded order,
   * inside the refund's transaction. Skips courses that are already REVOKED.
   */
  async revokePurchasedForOrder(
    admin: AuthUser,
    studentId: string,
    courseIds: readonly string[],
    reason: string,
    tx: TransactionClient,
  ): Promise<number> {
    adminScope(admin);
    let revoked = 0;
    for (const courseId of courseIds) {
      const existing = await this.enrollmentDao.getEnrollmentState(studentId, courseId, tx);
      if (!existing || existing.status === EnrollmentStatus.REVOKED) continue;
      await this.adminRevoke(admin, existing.id, { reason }, tx);
      revoked += 1;
    }
    return revoked;
  }

  /** #52: the student's courses with completion percentage. */
  async dashboard(user: AuthUser): Promise<DashboardEntry[]> {
    const enrollments = await this.enrollmentDao.getStudentEnrollments(user.id);
    const courseIds = enrollments.map((e) => e.course.id);
    const [totals, completed] = await Promise.all([
      this.enrollmentDao.countLessonsPerCourse(courseIds),
      this.enrollmentDao.countCompletedLessonsPerCourse([user.id], courseIds),
    ]);
    const now = new Date();
    return enrollments.map((enrollment) => {
      const totalLessons = totals.get(enrollment.course.id) ?? 0;
      const completedLessons = completed.get(`${user.id}:${enrollment.course.id}`) ?? 0;
      return {
        ...enrollment,
        access: accessState(enrollment, now),
        totalLessons,
        completedLessons,
        completionPercent: completionPercent(completedLessons, totalLessons),
      };
    });
  }

  /** #50: a teacher sees enrollments in their own courses only (view only, decided). */
  async listForTeacher(
    user: AuthUser,
    courseId: string,
    query: ListEnrollmentsQuery,
  ): Promise<Paged<EnrollmentView>> {
    const scope = teacherScope(user);
    await this.courseService.loadInScope(scope, courseId);
    return this.list(scope, { ...query, courseId });
  }

  async listForAdmin(admin: AuthUser, query: ListEnrollmentsQuery): Promise<Paged<EnrollmentView>> {
    return this.list(adminScope(admin), query);
  }

  private async list(
    scope: TeacherScope,
    query: ListEnrollmentsQuery,
  ): Promise<Paged<EnrollmentView>> {
    const where: Prisma.EnrollmentWhereInput = {
      courseId: query.courseId,
      studentId: query.studentId,
      status: query.status,
    };
    const [rows, total] = await Promise.all([
      this.enrollmentDao.getEnrollmentsBy(scope, where, query),
      this.enrollmentDao.countEnrollmentsBy(scope, where),
    ]);
    const courseIds = [...new Set(rows.map((r) => r.course.id))];
    const [totals, completed] = await Promise.all([
      this.enrollmentDao.countLessonsPerCourse(courseIds),
      this.enrollmentDao.countCompletedLessonsPerCourse(
        rows.map((r) => r.student.id),
        courseIds,
      ),
    ]);
    const items = rows.map((row) => ({
      ...row,
      completionPercent: completionPercent(
        completed.get(`${row.student.id}:${row.course.id}`) ?? 0,
        totals.get(row.course.id) ?? 0,
      ),
    }));
    return { items, total, limit: query.limit, offset: query.offset };
  }

  /** #102: enrollments granted (any source) since `since`, for the admin dashboard. */
  async countGrantedSince(admin: AuthUser, since: Date): Promise<number> {
    return this.enrollmentDao.countEnrollmentsBy(adminScope(admin), { grantedAt: { gte: since } });
  }

  /** #51 job: mark enrollments past their expiry. Access is already denied by date. */
  expireDue(now = new Date()): Promise<number> {
    return this.enrollmentDao.expireDueEnrollments(now);
  }

  private async loadCourseFacts(courseId: string): Promise<EnrollableCourseFacts> {
    const [course] = await this.courseService.getSaleFacts([courseId]);
    if (!course) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });
    return {
      status: course.status,
      audienceType: course.audienceType,
      isFree: course.isFree,
      isEnrollmentOpen: course.isEnrollmentOpen,
      teacherId: course.teacherId,
      teacherActive: course.teacher.status === UserStatus.ACTIVE,
    };
  }

  private async loadEnrollment(id: string, tx?: TransactionClient): Promise<EnrollmentRecord> {
    const enrollment = await this.enrollmentDao.getEnrollmentById(id, tx);
    if (!enrollment) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'enrollment', id });
    return enrollment;
  }
}
