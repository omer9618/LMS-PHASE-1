import { Injectable } from '@nestjs/common';
import { CompletionSource } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AssessmentService } from '../../assessment/services/assessment.service';
import { CompletionRecord, CourseStructureRecord, ProgressDao } from '../dao/progress.dao';
import {
  deriveLessonStates,
  LessonLock,
  LessonState,
  LessonTypeValue,
  lockMessage,
} from '../domain/progress.rules';

export type { CompletionRecord, CourseStructureRecord };

/** One lesson in course order (section order, then lesson order). */
export interface CourseLesson {
  id: string;
  title: string;
  type: LessonTypeValue;
  sectionId: string;
  sectionTitle: string;
  isFreePreview: boolean;
  durationSeconds: number | null;
  /** A quiz lesson whose quiz is a checkpoint (`is_breakpoint`, #77). */
  isCheckpoint: boolean;
  passingScorePct: number | null;
}

export interface StudentCourseProgress {
  lessons: CourseLesson[];
  completions: Map<string, CompletionRecord>;
  passedQuizzes: Map<string, Date>;
  states: Map<string, LessonState>;
}

export function flattenCourse(course: CourseStructureRecord): CourseLesson[] {
  return course.sections.flatMap((section) =>
    section.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      sectionId: section.id,
      sectionTitle: section.title,
      isFreePreview: lesson.isFreePreview,
      durationSeconds: lesson.videoAsset?.durationSeconds ?? null,
      isCheckpoint: lesson.type === 'QUIZ' && lesson.quiz?.isBreakpoint === true,
      passingScorePct: lesson.quiz?.passingScorePct ?? null,
    })),
  );
}

export function lockedException(lessonId: string, lock: LessonLock): AppException {
  return new AppException(
    ErrorCode.LESSON_LOCKED,
    {
      lessonId,
      cause: lock.cause,
      blockingLessonId: lock.blockingLessonId,
      blockingLessonTitle: lock.blockingLessonTitle,
    },
    undefined,
    { message: lockMessage(lock) },
  );
}

/**
 * Lesson unlock state for a student (#96, #97, #77), derived on every read and never stored.
 *
 * Exported to the content module, whose ContentAccessService calls `assertLessonUnlocked` before
 * playback and resource downloads. Dependency direction: content → progress → courses/enrollment;
 * courses and enrollment never import progress.
 */
@Injectable()
export class ProgressAccessService {
  constructor(
    private readonly progressDao: ProgressDao,
    private readonly assessment: AssessmentService,
  ) {}

  /**
   * Throws 403 LESSON_LOCKED (info: cause, blockingLessonId, blockingLessonTitle) when the lesson
   * is locked for this student. Call it only for students whose access comes from an enrollment;
   * staff (the course's teacher, admins) are never locked. Existence and enrollment are the
   * caller's checks: an unknown course or lesson passes through here unchanged.
   */
  async assertLessonUnlocked(studentId: string, courseId: string, lessonId: string): Promise<void> {
    const course = await this.progressDao.getCourseStructure(courseId);
    if (!course) return;
    const progress = await this.studentProgress(studentId, course);
    const state = progress.states.get(lessonId);
    if (state?.state === 'LOCKED') throw lockedException(lessonId, state.lock);
  }

  /**
   * Completions, passed quizzes and unlock states of one student in one course.
   *
   * Passed quizzes are recorded lazily as QUIZ completions here (#90): the grader lives in the
   * assessment module, so the completion row (with its source) is written the first time progress
   * is read after a pass. The write is idempotent.
   */
  async studentProgress(
    studentId: string,
    course: CourseStructureRecord,
  ): Promise<StudentCourseProgress> {
    const lessons = flattenCourse(course);
    const [completionRows, passedQuizzes] = await Promise.all([
      this.progressDao.getCompletions(studentId, course.id),
      this.passedQuizzes(studentId, course.id),
    ]);
    const completions = new Map(completionRows.map((c) => [c.lessonId, c]));

    const missing = lessons.filter(
      (l) => l.type === 'QUIZ' && passedQuizzes.has(l.id) && !completions.has(l.id),
    );
    if (missing.length > 0) {
      await this.progressDao.recordCompletions(
        missing.map((l) => ({
          studentId,
          lessonId: l.id,
          source: CompletionSource.QUIZ,
          completedAt: passedQuizzes.get(l.id) as Date,
        })),
      );
      for (const l of missing) {
        completions.set(l.id, {
          lessonId: l.id,
          completionSource: CompletionSource.QUIZ,
          completedAt: passedQuizzes.get(l.id) as Date,
        });
      }
    }

    const states = deriveLessonStates(
      course.progressionMode,
      lessons.map((l) => ({
        id: l.id,
        title: l.title,
        isFreePreview: l.isFreePreview,
        isCheckpoint: l.isCheckpoint,
        completed: completions.has(l.id),
        quizPassed: passedQuizzes.has(l.id),
      })),
    );
    return {
      lessons,
      completions,
      passedQuizzes,
      states: new Map(states.map((s) => [s.lessonId, s])),
    };
  }

  /** Passed quizzes (lesson id → first passing submission), from the assessment module's grader. */
  private passedQuizzes(studentId: string, courseId: string): Promise<Map<string, Date>> {
    return this.assessment.passedQuizLessonIds(studentId, courseId);
  }
}
