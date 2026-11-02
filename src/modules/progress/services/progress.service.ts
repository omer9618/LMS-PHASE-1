import { Injectable } from '@nestjs/common';
import { CompletionSource, CourseStatus, Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { completionPercent } from '../../enrollment/domain/enrollment.rules';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { CourseStructureRecord, ProgressDao } from '../dao/progress.dao';
import {
  assertManuallyCompletable,
  assertWatchable,
  currentLessonId,
  decideWatchUpdate,
  LessonLock,
  lockMessage,
  reachesCompletionThreshold,
} from '../domain/progress.rules';
import {
  CourseLesson,
  flattenCourse,
  lockedException,
  ProgressAccessService,
  StudentCourseProgress,
} from './progress-access.service';

export interface Completion {
  source: CompletionSource;
  completedAt: Date;
}

export interface OutlineLesson {
  id: string;
  title: string;
  type: CourseLesson['type'];
  isFreePreview: boolean;
  durationSeconds: number | null;
  isCheckpoint: boolean;
  passingScorePct: number | null;
  state: 'COMPLETED' | 'AVAILABLE' | 'LOCKED';
  lock: (LessonLock & { message: string }) | null;
  completion: Completion | null;
  /** Video lessons: where to resume (#91). */
  resumePositionSeconds: number | null;
}

export interface LearnerOutline {
  courseId: string;
  title: string;
  progressionMode: CourseStructureRecord['progressionMode'];
  /** STAFF: the course's teacher or an admin, previewing; never locked, no progress. */
  viewer: 'STUDENT' | 'STAFF';
  currentLessonId: string | null;
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  sections: { id: string; title: string; lessons: OutlineLesson[] }[];
}

export interface WatchProgress {
  lessonId: string;
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  durationSeconds: number | null;
  completion: Completion | null;
}

const LIVE: CourseStatus[] = [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED];

/**
 * The learner side of progress (#90–#94, #96, #97): the course outline with lesson states, watch
 * positions with automatic completion, and manual completion.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly progressDao: ProgressDao,
    private readonly access: ProgressAccessService,
    private readonly enrollments: EnrollmentAccessService,
    private readonly settings: PlatformSettingsService,
    private readonly transactions: TransactionService,
  ) {}

  /** #94, #96, #97: sections and lessons with state, the next lesson and completion percentage. */
  async learnerOutline(user: AuthUser, courseId: string): Promise<LearnerOutline> {
    const { course, staff } = await this.loadCourse(user, courseId, { allowStaff: true });
    const progress = staff ? null : await this.access.studentProgress(user.id, course);
    const watches = staff ? [] : await this.progressDao.getWatchStates(user.id, courseId);
    const resume = new Map(watches.map((w) => [w.lessonId, w.lastPositionSeconds]));

    const lessons = progress?.lessons ?? flattenCourse(course);
    const outlineLessons = new Map(
      lessons.map((lesson) => [lesson.id, this.outlineLesson(lesson, progress, resume)]),
    );
    const completed = progress?.completions.size ?? 0;
    return {
      courseId: course.id,
      title: course.title,
      progressionMode: course.progressionMode,
      viewer: staff ? 'STAFF' : 'STUDENT',
      currentLessonId: progress
        ? currentLessonId(lessons.map((l) => progress.states.get(l.id)!))
        : (lessons[0]?.id ?? null),
      completedLessons: completed,
      totalLessons: lessons.length,
      completionPercent: completionPercent(completed, lessons.length),
      sections: course.sections.map((section) => ({
        id: section.id,
        title: section.title,
        lessons: section.lessons.map((l) => outlineLessons.get(l.id)!),
      })),
    };
  }

  /** #91: the resume position of a video lesson. */
  async getWatch(user: AuthUser, courseId: string, lessonId: string): Promise<WatchProgress> {
    const { lesson } = await this.loadStudentLesson(user, courseId, lessonId);
    assertWatchable(lesson.type);
    const [watch, completion] = await Promise.all([
      this.progressDao.getWatchState(user.id, lessonId),
      this.progressDao.getCompletion(user.id, lessonId),
    ]);
    return {
      lessonId,
      lastPositionSeconds: watch?.lastPositionSeconds ?? 0,
      maxPositionSeconds: watch?.maxPositionSeconds ?? 0,
      durationSeconds: lesson.durationSeconds,
      completion: completion ? toCompletion(completion) : null,
    };
  }

  /**
   * #91, #92: stores the last and (skip-resistant) maximum position, and records an AUTO completion
   * once the maximum position reaches VIDEO_COMPLETION_THRESHOLD_PCT of the duration.
   */
  async reportWatch(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    positionSeconds: number,
  ): Promise<WatchProgress> {
    const { lesson } = await this.loadStudentLesson(user, courseId, lessonId);
    assertWatchable(lesson.type);
    const threshold = await this.settings.get('VIDEO_COMPLETION_THRESHOLD_PCT');
    const now = new Date();

    return this.transactions.run(async (tx) => {
      const current = await this.progressDao.getWatchState(user.id, lessonId);
      const next = decideWatchUpdate(current, positionSeconds, lesson.durationSeconds, now);
      const saved = await this.progressDao.saveWatchState(user.id, lessonId, next, tx);
      let completion = await this.progressDao.getCompletion(user.id, lessonId);
      if (
        !completion &&
        reachesCompletionThreshold(saved.maxPositionSeconds, lesson.durationSeconds, threshold)
      ) {
        completion = await this.progressDao.recordCompletion(
          user.id,
          lessonId,
          CompletionSource.AUTO,
          now,
          tx,
        );
      }
      return {
        lessonId,
        lastPositionSeconds: saved.lastPositionSeconds,
        maxPositionSeconds: saved.maxPositionSeconds,
        durationSeconds: lesson.durationSeconds,
        completion: completion ? toCompletion(completion) : null,
      };
    });
  }

  /** #93: mark a non-quiz lesson complete (source MANUAL). Idempotent: keeps the first record. */
  async completeManually(user: AuthUser, courseId: string, lessonId: string): Promise<Completion> {
    const { lesson } = await this.loadStudentLesson(user, courseId, lessonId);
    assertManuallyCompletable(lesson.type);
    const completion = await this.progressDao.recordCompletion(
      user.id,
      lessonId,
      CompletionSource.MANUAL,
      new Date(),
    );
    return toCompletion(completion);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private outlineLesson(
    lesson: CourseLesson,
    progress: StudentCourseProgress | null,
    resume: Map<string, number>,
  ): OutlineLesson {
    const state = progress?.states.get(lesson.id);
    const completion = progress?.completions.get(lesson.id);
    return {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      isFreePreview: lesson.isFreePreview,
      durationSeconds: lesson.durationSeconds,
      isCheckpoint: lesson.isCheckpoint,
      passingScorePct: lesson.passingScorePct,
      state: state?.state ?? 'AVAILABLE',
      lock: state?.state === 'LOCKED' ? { ...state.lock, message: lockMessage(state.lock) } : null,
      completion: completion ? toCompletion(completion) : null,
      resumePositionSeconds: lesson.type === 'VIDEO' ? (resume.get(lesson.id) ?? 0) : null,
    };
  }

  /**
   * The course, for a student with an active enrollment in a live course, or (when allowed) for
   * staff. Unknown or not-live courses are 404 for students, like the content gate.
   */
  private async loadCourse(
    user: AuthUser,
    courseId: string,
    options: { allowStaff: boolean },
  ): Promise<{ course: CourseStructureRecord; staff: boolean }> {
    const course = await this.progressDao.getCourseStructure(courseId);
    if (!course) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });
    const staff = user.id === course.teacherId || user.roles.has(Role.ADMIN);
    if (staff && options.allowStaff) return { course, staff: true };

    const state = await this.enrollments.accessState(user.id, courseId);
    if (state === 'ACTIVE' && LIVE.includes(course.status)) return { course, staff: false };
    if (!LIVE.includes(course.status) && !staff) {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: courseId });
    }
    throw new AppException(
      state === 'EXPIRED' ? ErrorCode.ENROLLMENT_EXPIRED : ErrorCode.ENROLLMENT_REQUIRED,
      { courseId },
    );
  }

  /**
   * A lesson of a course the student may use, and not locked for them (#96, #77). Progress is
   * recorded for enrolled students only; staff previewing a course have none.
   */
  private async loadStudentLesson(
    user: AuthUser,
    courseId: string,
    lessonId: string,
  ): Promise<{ course: CourseStructureRecord; lesson: CourseLesson }> {
    const { course } = await this.loadCourse(user, courseId, { allowStaff: false });
    const progress = await this.access.studentProgress(user.id, course);
    const lesson = progress.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'lesson', id: lessonId });
    const state = progress.states.get(lessonId);
    if (state?.state === 'LOCKED') throw lockedException(lessonId, state.lock);
    return { course, lesson };
  }
}

function toCompletion(row: { completionSource: CompletionSource; completedAt: Date }): Completion {
  return { source: row.completionSource, completedAt: row.completedAt };
}
