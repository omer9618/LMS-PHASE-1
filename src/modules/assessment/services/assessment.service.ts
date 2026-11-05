import { Injectable } from '@nestjs/common';
import { AttemptDao } from '../dao/attempt.dao';
import { AttemptGradingService } from './attempt-grading.service';

/**
 * The assessment module's API for other modules (progress, checkpoint gating #77, completion).
 * Returns lesson ids (and times) only; never quiz content or answers. Callers are responsible for
 * having authorised the student/course pair they ask about.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly grading: AttemptGradingService,
    private readonly attemptDao: AttemptDao,
  ) {}

  /**
   * The course's quizzes the student has passed: lesson id → time of the first passing submission
   * (a closed attempt with is_passed = true, set by the grader from the quiz's passing_score_pct).
   * Quizzes without a passing score are never "passed"; see submittedQuizLessonIds. Expired
   * attempts left open are closed (graded) first, so an abandoned timed attempt still counts.
   */
  async passedQuizLessonIds(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<Map<string, Date>> {
    await this.grading.closeExpiredAttemptsInCourse(studentId, courseId, now);
    const passed = new Map<string, Date>();
    for (const row of await this.attemptDao.getPassingAttempts(studentId, courseId)) {
      if (!passed.has(row.quiz.lessonId) && row.submittedAt) {
        passed.set(row.quiz.lessonId, row.submittedAt);
      }
    }
    return passed;
  }

  /** Lesson ids of the course's quizzes where the student has at least one closed attempt. */
  async submittedQuizLessonIds(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<Set<string>> {
    await this.grading.closeExpiredAttemptsInCourse(studentId, courseId, now);
    return new Set(await this.attemptDao.getAttemptedLessonIds(studentId, courseId, false));
  }

  /** Lesson ids of the course's checkpoint quizzes (is_breakpoint; always have a passing score). */
  async breakpointQuizLessonIds(courseId: string): Promise<Set<string>> {
    return new Set(await this.attemptDao.getBreakpointLessonIds(courseId));
  }
}
