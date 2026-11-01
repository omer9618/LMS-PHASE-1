import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import {
  AdminEnrollmentsController,
  EnrollmentController,
  TeacherEnrollmentsController,
} from './controllers/enrollment.controller';
import { EnrollmentDao } from './dao/enrollment.dao';
import { EnrollmentExpiryJob } from './jobs/enrollment-expiry.job';
import { EnrollmentAccessService } from './services/enrollment-access.service';
import { EnrollmentService } from './services/enrollment.service';

/** Enrollment (#46–#52). */
@Module({
  imports: [AuditModule, AuthModule, CoursesModule],
  controllers: [EnrollmentController, TeacherEnrollmentsController, AdminEnrollmentsController],
  providers: [EnrollmentService, EnrollmentAccessService, EnrollmentDao, EnrollmentExpiryJob],
  // Contract: access checks for content gates; grants for payment confirmation (#48).
  exports: [EnrollmentAccessService, EnrollmentService],
})
export class EnrollmentModule {}
