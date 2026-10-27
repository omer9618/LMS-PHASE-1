import { Injectable } from '@nestjs/common';
import { AudienceType, CourseStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * The public scope of the catalogue (#40): published student courses of active teachers.
 * Every query here ANDs it in, so nothing unpublished, PD (not sold in Phase 1, decided
 * 2026-10-27) or from a suspended teacher (#22) can ever be listed or opened.
 */
export const PUBLIC_COURSE_WHERE: Prisma.CourseWhereInput = {
  status: CourseStatus.PUBLISHED,
  audienceType: AudienceType.STUDENT,
  teacher: { status: UserStatus.ACTIVE },
};

/** Public fields only: no commission, proposed rate or who priced the course. */
const cardSelect = {
  id: true,
  title: true,
  description: true,
  syllabusArea: true,
  isFree: true,
  priceMinor: true,
  currency: true,
  progressionMode: true,
  isEnrollmentOpen: true,
  publishedAt: true,
  board: { select: { id: true, name: true } },
  level: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
} satisfies Prisma.CourseSelect;

const detailSelect = {
  ...cardSelect,
  teacher: {
    select: {
      id: true,
      fullName: true,
      teacherProfile: {
        select: { bio: true, photoUrl: true, qualifications: true, isPublished: true },
      },
    },
  },
  sections: {
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      title: true,
      lessons: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          isFreePreview: true,
          videoAsset: { select: { durationSeconds: true, status: true } },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

export type CourseCardRecord = Prisma.CourseGetPayload<{ select: typeof cardSelect }>;
export type CourseDetailRecord = Prisma.CourseGetPayload<{ select: typeof detailSelect }>;

@Injectable()
export class CatalogueDao {
  constructor(private readonly prisma: PrismaService) {}

  getCourseCardsBy(
    where: Prisma.CourseWhereInput,
    orderBy: Prisma.CourseOrderByWithRelationInput[],
    page: { limit: number; offset: number },
  ): Promise<CourseCardRecord[]> {
    return this.prisma.course.findMany({
      where: { AND: [PUBLIC_COURSE_WHERE, where] },
      select: cardSelect,
      orderBy: [...orderBy, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countCoursesBy(where: Prisma.CourseWhereInput): Promise<number> {
    return this.prisma.course.count({ where: { AND: [PUBLIC_COURSE_WHERE, where] } });
  }

  getCourseDetail(courseId: string): Promise<CourseDetailRecord | null> {
    return this.prisma.course.findFirst({
      where: { AND: [PUBLIC_COURSE_WHERE, { id: courseId }] },
      select: detailSelect,
    });
  }

  /** Subjects that have at least one public course, with the count (the browse axis, #40). */
  async getSubjectsWithCourses(): Promise<
    Array<{ id: string; name: string; courseCount: number }>
  > {
    const groups = await this.prisma.course.groupBy({
      by: ['subjectId'],
      where: PUBLIC_COURSE_WHERE,
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: groups.map((g) => g.subjectId) } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const counts = new Map(groups.map((g) => [g.subjectId, g._count._all]));
    return subjects.map((s) => ({ ...s, courseCount: counts.get(s.id) ?? 0 }));
  }
}
