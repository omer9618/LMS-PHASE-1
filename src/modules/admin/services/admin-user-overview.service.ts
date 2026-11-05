import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import type { Paged } from '../../audit/services/audit.service';
import { AdminUserView, UserAdminService } from '../../auth/services/user-admin.service';
import { CourseService, CourseView } from '../../courses/services/course.service';
import { EnrollmentService, EnrollmentView } from '../../enrollment/services/enrollment.service';

const SECTION_LIMIT = 50;

/**
 * Everything an admin needs on one user's page (#103). Each section is the first page; the full
 * lists stay on their own endpoints (GET /admin/enrollments?studentId=, GET /admin/courses, ...).
 */
export interface AdminUserOverview {
  user: AdminUserView;
  /** The user's enrollments as a student (any status), with completion. */
  enrollments: Paged<EnrollmentView>;
  /** Courses the user teaches (any status); null if the account is not a teacher. */
  coursesTaught: { items: CourseView[]; total: number } | null;
}

@Injectable()
export class AdminUserOverviewService {
  constructor(
    private readonly userAdmin: UserAdminService,
    private readonly enrollmentService: EnrollmentService,
    private readonly courseService: CourseService,
  ) {}

  async getOverview(admin: AuthUser, userId: string): Promise<AdminUserOverview> {
    adminScope(admin);
    const user = await this.userAdmin.getUser(admin, userId);
    const page = { limit: SECTION_LIMIT, offset: 0 };
    const [enrollments, coursesTaught] = await Promise.all([
      this.enrollmentService.listForAdmin(admin, { studentId: userId, ...page }),
      user.roles.includes(Role.TEACHER)
        ? this.courseService.listCoursesTaughtBy(admin, userId, page)
        : null,
    ]);
    return { user, enrollments, coursesTaught };
  }
}
