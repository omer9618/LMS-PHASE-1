import { Injectable } from '@nestjs/common';
import { EnrollmentDao } from '../dao/enrollment.dao';
import { AccessState, accessState } from '../domain/enrollment.rules';

/**
 * The one place that answers "may this student use this course right now?" (#39, #46, #51).
 * Every content gate calls it; nothing else reads enrollments to decide access.
 */
@Injectable()
export class EnrollmentAccessService {
  constructor(private readonly enrollmentDao: EnrollmentDao) {}

  async accessState(studentId: string, courseId: string, now = new Date()): Promise<AccessState> {
    const enrollment = await this.enrollmentDao.getEnrollmentState(studentId, courseId);
    return accessState(enrollment, now);
  }

  async hasActiveEnrollment(
    studentId: string,
    courseId: string,
    now = new Date(),
  ): Promise<boolean> {
    return (await this.accessState(studentId, courseId, now)) === 'ACTIVE';
  }
}
