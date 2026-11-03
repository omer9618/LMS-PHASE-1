import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { CourseService } from '../../courses/services/course.service';
import { EnrollmentService } from '../../enrollment/services/enrollment.service';
import { OrderService } from '../../orders/services/order.service';
import { TeacherApplicationService } from '../../teachers/services/teacher-application.service';
import { startOfUtcDay, totalAttention } from '../domain/dashboard.rules';

/** Queue counts for the admin navigation (#102). `null` = that queue does not exist yet. */
export interface AdminDashboard {
  generatedAt: Date;
  queues: {
    /** Courses submitted and waiting for approval (#28). */
    coursesPendingApproval: number;
    /** Teacher applications SUBMITTED or UNDER_REVIEW (#20). */
    teacherApplicationsOpen: number;
    /** Orders with a payment proof waiting for verification (PROOF_SUBMITTED, #58/#63). */
    paymentVerificationsPending: number | null;
    /** Payout disputes and failed payouts (#84–#89). Not built yet: always null. */
    payoutConcerns: number | null;
  };
  /** Sum of the queues above that exist: a single badge for the navigation. */
  needsAttention: number;
  today: {
    /** From midnight UTC. */
    since: Date;
    /** Enrollments granted today, any source (free, admin grant, purchase). */
    enrollmentsGranted: number;
  };
}

/**
 * Admin dashboard (#102). Reads every count through the owning module's exported service, never
 * its DAO, so each module keeps its own rules about what counts.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly courseService: CourseService,
    private readonly applicationService: TeacherApplicationService,
    private readonly enrollmentService: EnrollmentService,
    private readonly orderService: OrderService,
  ) {}

  async getDashboard(admin: AuthUser, now = new Date()): Promise<AdminDashboard> {
    adminScope(admin);
    const since = startOfUtcDay(now);
    const [courses, applications, verifications, enrollmentsGranted] = await Promise.all([
      this.courseService.countCoursesPendingApproval(admin),
      this.applicationService.countOpenApplications(admin),
      this.orderService.countOrdersAwaitingVerification(admin),
      this.enrollmentService.countGrantedSince(admin, since),
    ]);
    const payoutConcerns = null;
    return {
      generatedAt: now,
      queues: {
        coursesPendingApproval: courses,
        teacherApplicationsOpen: applications,
        paymentVerificationsPending: verifications,
        payoutConcerns,
      },
      needsAttention: totalAttention([courses, applications, verifications, payoutConcerns]),
      today: { since, enrollmentsGranted },
    };
  }
}
