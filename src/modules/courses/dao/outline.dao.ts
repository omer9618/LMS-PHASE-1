import { Injectable } from '@nestjs/common';
import { LessonType, Prisma } from '@prisma/client';
import { scopeWhere, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const lessonSelect = {
  id: true,
  sectionId: true,
  title: true,
  type: true,
  orderIndex: true,
  bodyText: true,
  isFreePreview: true,
  createdAt: true,
  videoAsset: { select: { id: true, provider: true, status: true, durationSeconds: true } },
} satisfies Prisma.LessonSelect;

const sectionSelect = {
  id: true,
  courseId: true,
  title: true,
  orderIndex: true,
  lessons: { select: lessonSelect, orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.SectionSelect;

export type LessonRecord = Prisma.LessonGetPayload<{ select: typeof lessonSelect }>;
export type SectionRecord = Prisma.SectionGetPayload<{ select: typeof sectionSelect }>;

/**
 * Sections and lessons (#27). Teacher-owned through their course: every method takes the
 * TeacherScope and constrains the query through `course`, so an id from another teacher's course
 * simply does not match (#14).
 */
@Injectable()
export class OutlineDao {
  constructor(private readonly prisma: PrismaService) {}

  getOutline(scope: TeacherScope, courseId: string): Promise<SectionRecord[]> {
    return this.prisma.section.findMany({
      where: { course: { id: courseId, ...scopeWhere(scope) } },
      select: sectionSelect,
      orderBy: { orderIndex: 'asc' },
    });
  }

  getSectionBy(
    scope: TeacherScope,
    courseId: string,
    sectionId: string,
    tx?: TransactionClient,
  ): Promise<SectionRecord | null> {
    return (tx ?? this.prisma).section.findFirst({
      where: { id: sectionId, course: { id: courseId, ...scopeWhere(scope) } },
      select: sectionSelect,
    });
  }

  getLessonBy(
    scope: TeacherScope,
    courseId: string,
    lessonId: string,
    tx?: TransactionClient,
  ): Promise<LessonRecord | null> {
    return (tx ?? this.prisma).lesson.findFirst({
      where: { id: lessonId, section: { course: { id: courseId, ...scopeWhere(scope) } } },
      select: lessonSelect,
    });
  }

  /** Section ids in order. */
  async getSectionIds(courseId: string, tx: TransactionClient): Promise<string[]> {
    const rows = await tx.section.findMany({
      where: { courseId },
      select: { id: true },
      orderBy: { orderIndex: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  /** Lesson ids of a section in order. */
  async getLessonIds(sectionId: string, tx: TransactionClient): Promise<string[]> {
    const rows = await tx.lesson.findMany({
      where: { sectionId },
      select: { id: true },
      orderBy: { orderIndex: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  createSection(
    courseId: string,
    data: { title: string; orderIndex: number },
    tx: TransactionClient,
  ): Promise<SectionRecord> {
    return tx.section.create({ data: { ...data, courseId }, select: sectionSelect });
  }

  async updateSection(sectionId: string, data: { title: string }, tx?: TransactionClient) {
    await (tx ?? this.prisma).section.update({
      where: { id: sectionId },
      data,
      select: { id: true },
    });
  }

  async deleteSection(sectionId: string, tx: TransactionClient): Promise<void> {
    await tx.section.delete({ where: { id: sectionId }, select: { id: true } });
  }

  /** Writes positions 0..n-1 (the caller validated the set). */
  async setSectionOrder(order: Map<string, number>, tx: TransactionClient): Promise<void> {
    for (const [id, orderIndex] of order) {
      await tx.section.update({ where: { id }, data: { orderIndex }, select: { id: true } });
    }
  }

  createLesson(
    sectionId: string,
    data: {
      title: string;
      type: LessonType;
      orderIndex: number;
      bodyText: string | null;
      isFreePreview: boolean;
    },
    tx: TransactionClient,
  ): Promise<LessonRecord> {
    return tx.lesson.create({ data: { ...data, sectionId }, select: lessonSelect });
  }

  updateLesson(
    lessonId: string,
    data: Prisma.LessonUncheckedUpdateInput,
    tx?: TransactionClient,
  ): Promise<LessonRecord> {
    return (tx ?? this.prisma).lesson.update({
      where: { id: lessonId },
      data,
      select: lessonSelect,
    });
  }

  async deleteLesson(lessonId: string, tx: TransactionClient): Promise<void> {
    await tx.lesson.delete({ where: { id: lessonId }, select: { id: true } });
  }

  /** Writes section and position for each lesson (used by reorder and move). */
  async placeLessons(
    sectionId: string,
    orderedIds: string[],
    tx: TransactionClient,
  ): Promise<void> {
    for (const [orderIndex, id] of orderedIds.entries()) {
      await tx.lesson.update({
        where: { id },
        data: { sectionId, orderIndex },
        select: { id: true },
      });
    }
  }

  countLessonsInSection(sectionId: string, tx: TransactionClient): Promise<number> {
    return tx.lesson.count({ where: { sectionId } });
  }

  /** Student work attached to a lesson: completions, watch positions and quiz attempts. */
  async countLessonActivity(
    lessonId: string,
    tx: TransactionClient,
  ): Promise<{ progress: number; attempts: number }> {
    const [completions, watched, attempts] = await Promise.all([
      tx.lessonProgress.count({ where: { lessonId } }),
      tx.videoWatchProgress.count({ where: { lessonId } }),
      tx.quizAttempt.count({ where: { quiz: { lessonId } } }),
    ]);
    return { progress: completions + watched, attempts };
  }
}
