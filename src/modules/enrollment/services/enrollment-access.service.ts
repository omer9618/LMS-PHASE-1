import { Injectable } from '@nestjs/common';
import { EnrollmentDao } from '../dao/enrollment.dao';
import { isEnrollmentActive } from '../domain/enrollment.rules';

/**
 * The one place that answers "may this student use this course right now?" (#39, #46, #51).
 * Every content gate calls it; nothing else reads enrollments to decide access.
 */
@Injectable()
export class EnrollmentAccessService {
  constructor(private readonly enrollmentDao: EnrollmentDao) {}

  async hasActiveEnrollment(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<boolean> {
    const enrollment = await this.enrollmentDao.getEnrollmentForAccess(studentId, courseId);
    return enrollment !== null && isEnrollmentActive(enrollment, now);
  }
}
