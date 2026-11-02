import { Injectable } from '@nestjs/common';
import { CompletionSource, EnrollmentStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { teacherScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { Paged } from '../../audit/services/audit.service';
import { completionPercent } from '../../enrollment/domain/enrollment.rules';
import { AttemptRecord, CourseStructureRecord, ProgressDao } from '../dao/progress.dao';
import type { LessonLock } from '../domain/progress.rules';
import type { RosterQuery } from '../schemas/progress.schema';
import { CourseLesson, flattenCourse, ProgressAccessService } from './progress-access.service';
import type { Completion } from './progress.service';

export interface QuizResultSummary {
  lessonId: string;
  attempts: number;
  bestScorePct: number | null;
  passed: boolean;
}

export interface StudentProgressSummary {
  student: { id: string; fullName: string | null; email: string };
  enrollmentStatus: EnrollmentStatus;
  completedLessons: number;
  completionPercent: number;
  lastActivityAt: Date | null;
  quizzes: QuizResultSummary[];
}

export interface CourseProgressReport {
  courseId: string;
  title: string;
  totalLessons: number;
  /** Per lesson, over every student enrolled in the course. */
  lessons: {
    id: string;
    title: string;
    type: CourseLesson['type'];
    sectionTitle: string;
    isCheckpoint: boolean;
    completedCount: number;
  }[];
  students: Paged<StudentProgressSummary>;
}

export interface QuizAttemptView {
  attemptNumber: number;
  scorePct: number | null;
  isPassed: boolean | null;
  startedAt: Date;
  submittedAt: Date | null;
}

export interface StudentLessonProgress {
  id: string;
  title: string;
  type: CourseLesson['type'];
  sectionId: string;
  sectionTitle: string;
  isCheckpoint: boolean;
  state: 'COMPLETED' | 'AVAILABLE' | 'LOCKED';
  lock: LessonLock | null;
  completion: Completion | null;
  watch: { lastPositionSeconds: number; maxPositionSeconds: number; updatedAt: Date } | null;
  quizAttempts: QuizAttemptView[];
}

export interface StudentProgressDetail {
  courseId: string;
  student: { id: string; fullName: string | null; email: string };
  enrollmentStatus: EnrollmentStatus;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  lessons: StudentLessonProgress[];
}

/**
 * #95: a teacher sees progress and quiz results for their own courses only. Everything is read
 * through the teacher's scope, so another teacher's course (or a student not enrolled in it) is a
 * 404. View only.
 */
@Injectable()
export class TeacherProgressService {
  constructor(
    private readonly progressDao: ProgressDao,
    private readonly access: ProgressAccessService,
  ) {}

  async courseReport(
    user: AuthUser,
    courseId: string,
    query: RosterQuery,
  ): Promise<CourseProgressReport> {
    const scope = teacherScope(user);
    const course = await this.loadCourse(scope, courseId);
    const lessons = flattenCourse(course);

    const [roster, total] = await Promise.all([
      this.progressDao.getRoster(scope, courseId, query),
      this.progressDao.countRoster(scope, courseId),
    ]);
    const studentIds = roster.map((r) => r.student.id);
    const attempts = await this.progressDao.getQuizAttemptsFor(scope, courseId, studentIds);
    await this.recordPassedQuizzes(lessons, attempts);

    const [completions, watches, perLesson] = await Promise.all([
      this.progressDao.getCompletionsFor(scope, courseId, studentIds),
      this.progressDao.getWatchStatesFor(scope, courseId, studentIds),
      this.progressDao.countCompletionsPerLesson(scope, courseId),
    ]);

    const items = roster.map((entry) => {
      const id = entry.student.id;
      const mine = completions.filter((c) => c.studentId === id);
      const myAttempts = attempts.filter((a) => a.studentId === id);
      const activity = [
        ...mine.map((c) => c.completedAt),
        ...watches.filter((w) => w.studentId === id).map((w) => w.updatedAt),
        ...myAttempts.map((a) => a.submittedAt ?? a.startedAt),
      ];
      return {
        student: entry.student,
        enrollmentStatus: entry.status,
        completedLessons: mine.length,
        completionPercent: completionPercent(mine.length, lessons.length),
        lastActivityAt: activity.length
          ? new Date(Math.max(...activity.map((d) => d.getTime())))
          : null,
        quizzes: summariseQuizzes(lessons, myAttempts),
      };
    });

    return {
      courseId: course.id,
      title: course.title,
      totalLessons: lessons.length,
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        sectionTitle: l.sectionTitle,
        isCheckpoint: l.isCheckpoint,
        completedCount: perLesson.get(l.id) ?? 0,
      })),
      students: { items, total, limit: query.limit, offset: query.offset },
    };
  }

  /** One student's progress per lesson, with the state they see and every quiz attempt. */
  async studentDetail(
    user: AuthUser,
    courseId: string,
    studentId: string,
  ): Promise<StudentProgressDetail> {
    const scope = teacherScope(user);
    const course = await this.loadCourse(scope, courseId);
    const entry = await this.progressDao.getRosterEntry(scope, courseId, studentId);
    if (!entry) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'student', id: studentId });

    const progress = await this.access.studentProgress(studentId, course);
    const [watches, attempts] = await Promise.all([
      this.progressDao.getWatchStatesFor(scope, courseId, [studentId]),
      this.progressDao.getQuizAttemptsFor(scope, courseId, [studentId]),
    ]);
    const watchBy = new Map(watches.map((w) => [w.lessonId, w]));

    return {
      courseId,
      student: entry.student,
      enrollmentStatus: entry.status,
      completedLessons: progress.completions.size,
      totalLessons: progress.lessons.length,
      completionPercent: completionPercent(progress.completions.size, progress.lessons.length),
      lessons: progress.lessons.map((lesson) => {
        const state = progress.states.get(lesson.id)!;
        const completion = progress.completions.get(lesson.id);
        const watch = watchBy.get(lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          sectionId: lesson.sectionId,
          sectionTitle: lesson.sectionTitle,
          isCheckpoint: lesson.isCheckpoint,
          state: state.state,
          lock: state.state === 'LOCKED' ? state.lock : null,
          completion: completion
            ? { source: completion.completionSource, completedAt: completion.completedAt }
            : null,
          watch: watch
            ? {
                lastPositionSeconds: watch.lastPositionSeconds,
                maxPositionSeconds: watch.maxPositionSeconds,
                updatedAt: watch.updatedAt,
              }
            : null,
          quizAttempts: attempts
            .filter((a) => a.quiz.lessonId === lesson.id)
            .map((a) => ({
              attemptNumber: a.attemptNumber,
              scorePct: a.scorePct,
              isPassed: a.isPassed,
              startedAt: a.startedAt,
              submittedAt: a.submittedAt,
            })),
        };
      }),
    };
  }

  private async loadCourse(scope: TeacherScope, courseId: string): Promise<CourseStructureRecord> {
    const course = await this.progressDao.getCourseStructureInScope(scope, courseId);
    if (!course) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });
    return course;
  }

  /** Lazy QUIZ completions (#90) for the students on this page, as on the learner side. */
  private async recordPassedQuizzes(
    lessons: CourseLesson[],
    attempts: AttemptRecord[],
  ): Promise<void> {
    const quizLessons = new Set(lessons.filter((l) => l.type === 'QUIZ').map((l) => l.id));
    const rows = new Map<string, { studentId: string; lessonId: string; completedAt: Date }>();
    for (const a of attempts) {
      const key = `${a.studentId}:${a.quiz.lessonId}`;
      if (a.isPassed === true && quizLessons.has(a.quiz.lessonId) && !rows.has(key)) {
        rows.set(key, {
          studentId: a.studentId,
          lessonId: a.quiz.lessonId,
          completedAt: a.submittedAt ?? a.startedAt,
        });
      }
    }
    await this.progressDao.recordCompletions(
      [...rows.values()].map((r) => ({ ...r, source: CompletionSource.QUIZ })),
    );
  }
}

function summariseQuizzes(lessons: CourseLesson[], attempts: AttemptRecord[]): QuizResultSummary[] {
  return lessons
    .filter((l) => l.type === 'QUIZ')
    .map((l) => {
      const mine = attempts.filter((a) => a.quiz.lessonId === l.id);
      const scores = mine.map((a) => a.scorePct).filter((s): s is number => s !== null);
      return {
        lessonId: l.id,
        attempts: mine.length,
        bestScorePct: scores.length ? Math.max(...scores) : null,
        passed: mine.some((a) => a.isPassed === true),
      };
    });
}
