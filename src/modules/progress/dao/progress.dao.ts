import { Injectable } from '@nestjs/common';
import { CompletionSource, Prisma } from '@prisma/client';
import { scopeWhere, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const structureSelect = {
  id: true,
  title: true,
  status: true,
  teacherId: true,
  progressionMode: true,
  sections: {
    select: {
      id: true,
      title: true,
      orderIndex: true,
      lessons: {
        select: {
          id: true,
          title: true,
          type: true,
          orderIndex: true,
          isFreePreview: true,
          videoAsset: { select: { durationSeconds: true } },
          quiz: { select: { id: true, isBreakpoint: true, passingScorePct: true } },
        },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.CourseSelect;

const completionSelect = {
  lessonId: true,
  completionSource: true,
  completedAt: true,
} satisfies Prisma.LessonProgressSelect;

const watchSelect = {
  lessonId: true,
  lastPositionSeconds: true,
  maxPositionSeconds: true,
  updatedAt: true,
} satisfies Prisma.VideoWatchProgressSelect;

const attemptSelect = {
  studentId: true,
  attemptNumber: true,
  scorePct: true,
  isPassed: true,
  startedAt: true,
  submittedAt: true,
  quiz: { select: { lessonId: true } },
} satisfies Prisma.QuizAttemptSelect;

const rosterSelect = {
  status: true,
  grantedAt: true,
  expiresAt: true,
  student: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.EnrollmentSelect;

export type CourseStructureRecord = Prisma.CourseGetPayload<{ select: typeof structureSelect }>;
export type CompletionRecord = Prisma.LessonProgressGetPayload<{ select: typeof completionSelect }>;
export type WatchRecord = Prisma.VideoWatchProgressGetPayload<{ select: typeof watchSelect }>;
export type AttemptRecord = Prisma.QuizAttemptGetPayload<{ select: typeof attemptSelect }>;
export type RosterRecord = Prisma.EnrollmentGetPayload<{ select: typeof rosterSelect }>;

/** Where clause for "lessons of this course". */
const inCourse = (courseId: string) => ({ section: { courseId } });

/**
 * Progress (#90–#97, #77): completions, watch positions, and read-only quiz results.
 *
 * Student-facing reads are keyed by the student's own id. Teacher-facing reads (#95) take a
 * TeacherScope first and constrain through the course, so another teacher's course matches nothing.
 */
@Injectable()
export class ProgressDao {
  constructor(private readonly prisma: PrismaService) {}

  // ── Course structure ──────────────────────────────────────────────

  /**
   * Course, sections and lessons in course order, with what progress needs (type, duration,
   * checkpoint flags). Like OutlineDao.getLessonAccessContext this is an unscoped read for the
   * learner side: it returns no lesson content, and every caller authorises (enrollment or staff)
   * before returning anything.
   */
  getCourseStructure(courseId: string): Promise<CourseStructureRecord | null> {
    return this.prisma.course.findUnique({ where: { id: courseId }, select: structureSelect });
  }

  /** The same, for teachers (#95): scoped, so another teacher's course is null. */
  getCourseStructureInScope(
    scope: TeacherScope,
    courseId: string,
  ): Promise<CourseStructureRecord | null> {
    return this.prisma.course.findFirst({
      where: { AND: [{ id: courseId }, scopeWhere(scope)] },
      select: structureSelect,
    });
  }

  // ── Completions (#90) ─────────────────────────────────────────────

  getCompletions(studentId: string, courseId: string): Promise<CompletionRecord[]> {
    return this.prisma.lessonProgress.findMany({
      where: { studentId, lesson: inCourse(courseId) },
      select: completionSelect,
    });
  }

  getCompletion(studentId: string, lessonId: string): Promise<CompletionRecord | null> {
    return this.prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
      select: completionSelect,
    });
  }

  /**
   * Idempotent: one row per student and lesson (unique). A repeated completion keeps the first
   * row, its source and its time, and returns it.
   */
  recordCompletion(
    studentId: string,
    lessonId: string,
    source: CompletionSource,
    completedAt: Date,
    tx?: TransactionClient,
  ): Promise<CompletionRecord> {
    return (tx ?? this.prisma).lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      create: { studentId, lessonId, completionSource: source, completedAt },
      update: {},
      select: completionSelect,
    });
  }

  /** Many completions at once, skipping any that already exist. Returns how many were new. */
  async recordCompletions(
    rows: { studentId: string; lessonId: string; source: CompletionSource; completedAt: Date }[],
    tx?: TransactionClient,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await (tx ?? this.prisma).lessonProgress.createMany({
      data: rows.map((r) => ({
        studentId: r.studentId,
        lessonId: r.lessonId,
        completionSource: r.source,
        completedAt: r.completedAt,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  // ── Watch positions (#91) ─────────────────────────────────────────

  getWatchState(studentId: string, lessonId: string): Promise<WatchRecord | null> {
    return this.prisma.videoWatchProgress.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
      select: watchSelect,
    });
  }

  getWatchStates(studentId: string, courseId: string): Promise<WatchRecord[]> {
    return this.prisma.videoWatchProgress.findMany({
      where: { studentId, lesson: inCourse(courseId) },
      select: watchSelect,
    });
  }

  saveWatchState(
    studentId: string,
    lessonId: string,
    data: { lastPositionSeconds: number; maxPositionSeconds: number },
    tx?: TransactionClient,
  ): Promise<WatchRecord> {
    return (tx ?? this.prisma).videoWatchProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      create: { studentId, lessonId, ...data },
      update: data,
      select: watchSelect,
    });
  }

  // ── Teacher view (#95), scoped ────────────────────────────────────

  getRoster(
    scope: TeacherScope,
    courseId: string,
    page: { limit: number; offset: number },
  ): Promise<RosterRecord[]> {
    return this.prisma.enrollment.findMany({
      where: { AND: [{ courseId }, { course: scopeWhere(scope) }] },
      select: rosterSelect,
      orderBy: [{ grantedAt: 'asc' }, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countRoster(scope: TeacherScope, courseId: string): Promise<number> {
    return this.prisma.enrollment.count({
      where: { AND: [{ courseId }, { course: scopeWhere(scope) }] },
    });
  }

  getRosterEntry(
    scope: TeacherScope,
    courseId: string,
    studentId: string,
  ): Promise<RosterRecord | null> {
    return this.prisma.enrollment.findFirst({
      where: { AND: [{ courseId, studentId }, { course: scopeWhere(scope) }] },
      select: rosterSelect,
    });
  }

  /** Completions of the given students in the course. */
  getCompletionsFor(
    scope: TeacherScope,
    courseId: string,
    studentIds: string[],
  ): Promise<(CompletionRecord & { studentId: string })[]> {
    return this.prisma.lessonProgress.findMany({
      where: {
        studentId: { in: studentIds },
        lesson: { section: { course: { id: courseId, ...scopeWhere(scope) } } },
      },
      select: { ...completionSelect, studentId: true },
    });
  }

  getWatchStatesFor(
    scope: TeacherScope,
    courseId: string,
    studentIds: string[],
  ): Promise<(WatchRecord & { studentId: string })[]> {
    return this.prisma.videoWatchProgress.findMany({
      where: {
        studentId: { in: studentIds },
        lesson: { section: { course: { id: courseId, ...scopeWhere(scope) } } },
      },
      select: { ...watchSelect, studentId: true },
    });
  }

  /** Quiz attempts of the given students in the course, oldest first. */
  getQuizAttemptsFor(
    scope: TeacherScope,
    courseId: string,
    studentIds: string[],
  ): Promise<AttemptRecord[]> {
    return this.prisma.quizAttempt.findMany({
      where: {
        studentId: { in: studentIds },
        quiz: { lesson: { section: { course: { id: courseId, ...scopeWhere(scope) } } } },
      },
      select: attemptSelect,
      orderBy: [{ startedAt: 'asc' }, { attemptNumber: 'asc' }],
    });
  }

  /** Per lesson: how many enrolled students completed it (all enrollments of the course). */
  async countCompletionsPerLesson(
    scope: TeacherScope,
    courseId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: {
        lesson: { section: { course: { id: courseId, ...scopeWhere(scope) } } },
        student: { enrollments: { some: { courseId } } },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.lessonId, r._count._all]));
  }
}
