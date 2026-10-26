import { Injectable } from '@nestjs/common';
import { CourseStatus, Prisma } from '@prisma/client';
import { scopeWhere, TeacherOwnerScope, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const courseSelect = {
  id: true,
  teacherId: true,
  boardId: true,
  levelId: true,
  subjectId: true,
  syllabusArea: true,
  title: true,
  description: true,
  priceMinor: true,
  currency: true,
  commissionRateBps: true,
  teacherProposedBps: true,
  pricedById: true,
  pricedAt: true,
  isFree: true,
  status: true,
  progressionMode: true,
  audienceType: true,
  isEnrollmentOpen: true,
  createdAt: true,
  publishedAt: true,
  archivedAt: true,
  board: { select: { id: true, name: true } },
  level: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
} satisfies Prisma.CourseSelect;

export type CourseRecord = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

/** Fields a caller may write. teacherId comes from the scope, never from data. */
export type CourseCreateData = Omit<Prisma.CourseUncheckedCreateInput, 'id' | 'teacherId'>;
export type CourseUpdateData = Omit<Prisma.CourseUncheckedUpdateInput, 'id' | 'teacherId'>;

export interface Page {
  limit: number;
  offset: number;
}

/**
 * Courses are teacher-owned. Every method takes a TeacherScope as its first argument, and the
 * scope is ANDed into the query, so a caller-supplied `where` cannot widen it (#14).
 */
@Injectable()
export class CourseDao {
  constructor(private readonly prisma: PrismaService) {}

  /** Only a teacher scope can create: the course is always owned by the scoped teacher. */
  createCourse(
    scope: TeacherOwnerScope,
    data: CourseCreateData,
    tx?: TransactionClient,
  ): Promise<CourseRecord> {
    return (tx ?? this.prisma).course.create({
      data: { ...data, teacherId: scope.teacherId },
      select: courseSelect,
    });
  }

  getCourseBy(scope: TeacherScope, where: Prisma.CourseWhereInput): Promise<CourseRecord | null> {
    return this.prisma.course.findFirst({
      where: { AND: [where, scopeWhere(scope)] },
      select: courseSelect,
    });
  }

  getCoursesBy(
    scope: TeacherScope,
    where: Prisma.CourseWhereInput,
    page: Page,
    orderBy: Prisma.CourseOrderByWithRelationInput = { createdAt: 'desc' },
  ): Promise<CourseRecord[]> {
    return this.prisma.course.findMany({
      where: { AND: [where, scopeWhere(scope)] },
      select: courseSelect,
      orderBy: [orderBy, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countCoursesBy(
    scope: TeacherScope,
    where: Prisma.CourseWhereInput,
    tx?: TransactionClient,
  ): Promise<number> {
    return (tx ?? this.prisma).course.count({ where: { AND: [where, scopeWhere(scope)] } });
  }

  /**
   * Updates one course if it is in scope and (when given) still has `expectedStatus`.
   * Returns null when no row matched, so a concurrent change cannot be silently overwritten.
   */
  async updateCourse(
    scope: TeacherScope,
    target: { id: string; expectedStatus?: CourseStatus },
    data: CourseUpdateData,
    tx?: TransactionClient,
  ): Promise<CourseRecord | null> {
    try {
      return await (tx ?? this.prisma).course.update({
        where: {
          id: target.id,
          ...(target.expectedStatus ? { status: target.expectedStatus } : {}),
          ...scopeWhere(scope),
        },
        data,
        select: courseSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
