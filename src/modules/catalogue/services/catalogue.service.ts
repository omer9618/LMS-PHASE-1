import { Injectable } from '@nestjs/common';
import { Prisma, VideoStatus } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { CatalogueDao, CourseCardRecord, CourseDetailRecord } from '../dao/catalogue.dao';
import { describePriceFilter, ORDERING_STATEMENTS, sortKeys } from '../domain/catalogue.rules';
import type { CatalogueQuery } from '../schemas/catalogue.schema';

export type CourseCard = CourseCardRecord;

export interface CatalogueListing {
  items: CourseCard[];
  total: number;
  limit: number;
  offset: number;
  /** #44: the criterion behind the order, stated with every result. */
  ordering: string;
}

export interface CourseDetail extends Omit<CourseDetailRecord, 'teacher' | 'sections'> {
  teacher: {
    id: string;
    fullName: string | null;
    /** Only once the teacher has published their profile (#98). */
    profile: { bio: string | null; photoUrl: string | null; qualifications: string | null } | null;
  };
  /** Syllabus coverage (#43): section and lesson titles, never lesson content. */
  outline: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      isFreePreview: boolean;
      durationSeconds: number | null;
    }>;
  }>;
  /** The demo (#34): free-preview video lessons that can be played without enrolling. */
  demoLessonIds: string[];
  lessonCount: number;
  totalVideoSeconds: number;
}

/** Public catalogue (#40–#44). Read-only, no authentication, published student courses only. */
@Injectable()
export class CatalogueService {
  constructor(private readonly catalogueDao: CatalogueDao) {}

  async list(query: CatalogueQuery): Promise<CatalogueListing> {
    const where = this.buildWhere(query);
    const orderBy = sortKeys(query.sort).map((key): Prisma.CourseOrderByWithRelationInput =>
      key.field === 'price'
        ? {
            priceMinor: {
              sort: key.direction,
              // Free courses (no price) first when cheapest-first, last otherwise.
              nulls: key.direction === 'asc' ? 'first' : 'last',
            },
          }
        : { [key.field]: key.direction },
    );
    const [items, total] = await Promise.all([
      this.catalogueDao.getCourseCardsBy(where, orderBy, query),
      this.catalogueDao.countCoursesBy(where),
    ]);
    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
      ordering: ORDERING_STATEMENTS[query.sort],
    };
  }

  subjects() {
    return this.catalogueDao.getSubjectsWithCourses();
  }

  /** #43: everything a student needs before enrolling. 404 for anything not public. */
  async detail(courseId: string): Promise<CourseDetail> {
    const course = await this.catalogueDao.getCourseDetail(courseId);
    if (!course) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });

    const { teacher, sections, ...rest } = course;
    const profile = teacher.teacherProfile?.isPublished ? teacher.teacherProfile : null;
    const outline = sections.map((section) => ({
      id: section.id,
      title: section.title,
      lessons: section.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        isFreePreview: lesson.isFreePreview,
        durationSeconds:
          lesson.videoAsset?.status === VideoStatus.READY
            ? lesson.videoAsset.durationSeconds
            : null,
      })),
    }));
    const lessons = outline.flatMap((s) => s.lessons);

    return {
      ...rest,
      teacher: {
        id: teacher.id,
        fullName: teacher.fullName,
        profile: profile
          ? { bio: profile.bio, photoUrl: profile.photoUrl, qualifications: profile.qualifications }
          : null,
      },
      outline,
      demoLessonIds: sections
        .flatMap((s) => s.lessons)
        .filter(
          (l) =>
            l.isFreePreview && l.type === 'VIDEO' && l.videoAsset?.status === VideoStatus.READY,
        )
        .map((l) => l.id),
      lessonCount: lessons.length,
      totalVideoSeconds: lessons.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0),
    };
  }

  /** #41 search fields and #42 filters, combined with AND. */
  private buildWhere(query: CatalogueQuery): Prisma.CourseWhereInput {
    const and: Prisma.CourseWhereInput[] = [];
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { title: contains },
          { description: contains },
          { syllabusArea: contains },
          { subject: { name: contains } },
          { board: { name: contains } },
          { level: { name: contains } },
          { teacher: { fullName: contains } },
        ],
      });
    }
    if (query.subjectId) and.push({ subjectId: query.subjectId });
    if (query.boardId) and.push({ boardId: query.boardId });
    if (query.levelId) and.push({ levelId: query.levelId });
    if (query.pacing) and.push({ progressionMode: query.pacing });

    const price = describePriceFilter(query);
    if (price.kind === 'freeOnly') and.push({ isFree: true });
    if (price.kind === 'none') and.push({ id: { in: [] } });
    if (price.kind === 'paidRange') {
      and.push({ isFree: false, priceMinor: { gte: price.min, lte: price.max } });
    }
    return { AND: and };
  }
}
