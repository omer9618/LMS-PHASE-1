import { Injectable } from '@nestjs/common';
import { AttemptDao } from '../dao/attempt.dao';
import { QuizAttemptService } from './quiz-attempt.service';

/**
 * The assessment module's API for other modules (progress, checkpoint gating #77, completion).
 * Returns lesson ids only; never quiz content or answers. Callers are responsible for having
 * authorised the student/course pair they ask about.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly attempts: QuizAttemptService,
    private readonly attemptDao: AttemptDao,
  ) {}

  /**
   * Lesson ids of the course's quizzes the student has passed (a closed attempt with
   * is_passed = true). Quizzes without a passing score are never "passed"; see
   * submittedQuizLessonIds. Expired attempts left open are closed (graded) first.
   */
  async passedQuizLessonIds(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<Set<string>> {
    await this.attempts.closeExpiredAttemptsInCourse(studentId, courseId, now);
    return new Set(await this.attemptDao.getAttemptedLessonIds(studentId, courseId, true));
  }

  /** Lesson ids of the course's quizzes where the student has at least one closed attempt. */
  async submittedQuizLessonIds(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<Set<string>> {
    await this.attempts.closeExpiredAttemptsInCourse(studentId, courseId, now);
    return new Set(await this.attemptDao.getAttemptedLessonIds(studentId, courseId, false));
  }

  /** Lesson ids of the course's checkpoint quizzes (is_breakpoint; always have a passing score). */
  async breakpointQuizLessonIds(courseId: string): Promise<Set<string>> {
    return new Set(await this.attemptDao.getBreakpointLessonIds(courseId));
  }
}
