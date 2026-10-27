import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { scopeWhere, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const enrollmentStateSelect = {
  id: true,
  studentId: true,
  courseId: true,
  status: true,
  expiresAt: true,
} satisfies Prisma.EnrollmentSelect;

const enrollmentSelect = {
  id: true,
  status: true,
  source: true,
  paymentChannel: true,
  grantedAt: true,
  expiresAt: true,
  revokedAt: true,
  student: { select: { id: true, fullName: true, email: true } },
  course: { select: { id: true, title: true, teacherId: true } },
  grantedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.EnrollmentSelect;

const studentEnrollmentSelect = {
  id: true,
  status: true,
  source: true,
  grantedAt: true,
  expiresAt: true,
  course: {
    select: {
      id: true,
      title: true,
      status: true,
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentStateRecord = Prisma.EnrollmentGetPayload<{
  select: typeof enrollmentStateSelect;
}>;
export type EnrollmentRecord = Prisma.EnrollmentGetPayload<{ select: typeof enrollmentSelect }>;
export type StudentEnrollmentRecord = Prisma.EnrollmentGetPayload<{
  select: typeof studentEnrollmentSelect;
}>;

@Injectable()
export class EnrollmentDao {
  constructor(private readonly prisma: PrismaService) {}

  /** One enrollment per student per course (#46, unique), so this is the student's only row. */
  getEnrollmentState(
    studentId: string,
    courseId: string,
    tx?: TransactionClient,
  ): Promise<EnrollmentStateRecord | null> {
    return (tx ?? this.prisma).enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: enrollmentStateSelect,
    });
  }

  getEnrollmentById(id: string): Promise<EnrollmentRecord | null> {
    return this.prisma.enrollment.findUnique({ where: { id }, select: enrollmentSelect });
  }

  /**
   * Creates the student's enrollment or re-activates their existing row (the unique pair makes a
   * second row impossible). Records source and grant time (#46).
   */
  upsertEnrollment(
    studentId: string,
    courseId: string,
    data: {
      source: Prisma.EnrollmentCreateInput['source'];
      grantedById?: string | null;
      paymentChannel?: string | null;
      orderItemId?: string | null;
      expiresAt?: Date | null;
      grantedAt: Date;
    },
    tx?: TransactionClient,
  ): Promise<EnrollmentRecord> {
    const values = {
      status: EnrollmentStatus.ACTIVE,
      source: data.source,
      grantedById: data.grantedById ?? null,
      paymentChannel: data.paymentChannel ?? null,
      orderItemId: data.orderItemId ?? null,
      expiresAt: data.expiresAt ?? null,
      grantedAt: data.grantedAt,
      revokedAt: null,
    };
    return (tx ?? this.prisma).enrollment.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { studentId, courseId, ...values },
      update: values,
      select: enrollmentSelect,
    });
  }

  updateEnrollment(
    id: string,
    data: Prisma.EnrollmentUncheckedUpdateInput,
    tx?: TransactionClient,
  ): Promise<EnrollmentRecord> {
    return (tx ?? this.prisma).enrollment.update({ where: { id }, data, select: enrollmentSelect });
  }

  getStudentEnrollments(studentId: string): Promise<StudentEnrollmentRecord[]> {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      select: studentEnrollmentSelect,
      orderBy: { grantedAt: 'desc' },
    });
  }

  /** Teacher-owned: scoped through the course (#50, #14). Admin scope sees every course. */
  getEnrollmentsBy(
    scope: TeacherScope,
    where: Prisma.EnrollmentWhereInput,
    page: { limit: number; offset: number },
  ): Promise<EnrollmentRecord[]> {
    return this.prisma.enrollment.findMany({
      where: { AND: [where, { course: scopeWhere(scope) }] },
      select: enrollmentSelect,
      orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countEnrollmentsBy(scope: TeacherScope, where: Prisma.EnrollmentWhereInput): Promise<number> {
    return this.prisma.enrollment.count({ where: { AND: [where, { course: scopeWhere(scope) }] } });
  }

  /** Lesson totals per course, for completion percentages (#52, #94). */
  async countLessonsPerCourse(courseIds: string[]): Promise<Map<string, number>> {
    if (courseIds.length === 0) return new Map();
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, sections: { select: { _count: { select: { lessons: true } } } } },
    });
    return new Map(
      courses.map((c) => [c.id, c.sections.reduce((sum, s) => sum + s._count.lessons, 0)]),
    );
  }

  /** Lessons a student completed, per course. */
  async countCompletedLessonsPerCourse(
    studentIds: string[],
    courseIds: string[],
  ): Promise<Map<string, number>> {
    if (studentIds.length === 0 || courseIds.length === 0) return new Map();
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        studentId: { in: studentIds },
        lesson: { section: { courseId: { in: courseIds } } },
      },
      select: { studentId: true, lesson: { select: { section: { select: { courseId: true } } } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.studentId}:${row.lesson.section.courseId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  /** #51 job: ACTIVE enrollments past their expiry become EXPIRED. Returns how many. */
  async expireDueEnrollments(now: Date): Promise<number> {
    const { count } = await this.prisma.enrollment.updateMany({
      where: { status: EnrollmentStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: EnrollmentStatus.EXPIRED },
    });
    return count;
  }
}
