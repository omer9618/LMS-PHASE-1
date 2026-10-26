import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { AdminUserView, UserAdminService } from '../../auth/services/user-admin.service';
import { CourseService } from '../../courses/services/course.service';

/**
 * #22: teacher suspension and deactivation. Suspension is the generic account suspension (#15);
 * it stops new enrollments in the teacher's courses (enforced where enrollments are created).
 * Deactivation closes the account for good, so it is refused while students depend on the teacher.
 */
@Injectable()
export class TeacherAdminService {
  constructor(
    private readonly userAdmin: UserAdminService,
    private readonly courseService: CourseService,
    private readonly transactions: TransactionService,
  ) {}

  async deactivate(admin: AuthUser, teacherId: string, reason: string): Promise<AdminUserView> {
    adminScope(admin);
    const teacher = await this.userAdmin.getUser(admin, teacherId);
    if (!teacher.roles.includes(Role.TEACHER)) {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'teacher', id: teacherId });
    }

    // Check and change in one transaction, so a check can't go stale before the change lands.
    return this.transactions.run(async (tx) => {
      const committed = await this.courseService.countCommittedCourses(teacherId, tx);
      if (committed > 0) {
        throw new AppException(
          ErrorCode.INVALID_STATE_TRANSITION,
          { committedCourses: committed },
          undefined,
          {
            message:
              'This teacher still has courses with actively enrolled students. Suspend instead, or wait until those enrollments end.',
          },
        );
      }
      return this.userAdmin.changeStatus(admin, teacherId, 'DEACTIVATE', reason, tx);
    });
  }
}
