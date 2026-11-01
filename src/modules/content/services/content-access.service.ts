import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { OutlineService } from '../../courses/services/outline.service';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import {
  decideLessonAccess,
  decideResourceAccess,
  LessonAccessDecision,
  LessonAccessFacts,
} from '../domain/video.rules';

export type LessonContext = NonNullable<
  Awaited<ReturnType<OutlineService['getLessonAccessContext']>>
>;

/**
 * Server-side gate for lesson content (#37, #39). Loads the facts, asks the pure rules, and throws
 * before anything is returned. Not-available lessons are 404 (existence not revealed); lessons
 * that need an enrollment are 403 with a reason the UI can act on ("enrol to watch").
 */
@Injectable()
export class ContentAccessService {
  constructor(
    private readonly outline: OutlineService,
    private readonly enrollments: EnrollmentAccessService,
  ) {}

  async assertCanPlay(
    user: AuthUser | undefined,
    courseId: string,
    lessonId: string,
  ): Promise<LessonContext> {
    return this.check(user, courseId, lessonId, decideLessonAccess);
  }

  async assertCanDownloadResources(
    user: AuthUser | undefined,
    courseId: string,
    lessonId: string,
  ): Promise<LessonContext> {
    return this.check(user, courseId, lessonId, decideResourceAccess);
  }

  private async check(
    user: AuthUser | undefined,
    courseId: string,
    lessonId: string,
    decide: (facts: LessonAccessFacts) => LessonAccessDecision,
  ): Promise<LessonContext> {
    const lesson = await this.outline.getLessonAccessContext(courseId, lessonId);
    if (!lesson) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'lesson', id: lessonId });
    const course = lesson.section.course;

    const enrollment = user ? await this.enrollments.accessState(user.id, course.id) : 'NONE';
    const decision = decide({
      courseStatus: course.status,
      isFreePreview: lesson.isFreePreview,
      isCourseTeacher: user?.id === course.teacherId,
      isAdmin: user?.roles.has(Role.ADMIN) ?? false,
      hasActiveEnrollment: enrollment === 'ACTIVE',
    });
    if (decision.allowed) return lesson;
    if (decision.reason === 'NOT_AVAILABLE') {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'lesson', id: lessonId });
    }
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED, { courseId });
    // #51: an ended enrollment gets its own message, distinct from "enrol to watch".
    throw new AppException(
      enrollment === 'EXPIRED' ? ErrorCode.ENROLLMENT_EXPIRED : ErrorCode.ENROLLMENT_REQUIRED,
      { courseId },
    );
  }
}
