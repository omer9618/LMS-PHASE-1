import { Module } from '@nestjs/common';
import { EnrollmentDao } from './dao/enrollment.dao';
import { EnrollmentAccessService } from './services/enrollment-access.service';

/** Enrollment (#46–#53). */
@Module({
  providers: [EnrollmentAccessService, EnrollmentDao],
  exports: [EnrollmentAccessService],
})
export class EnrollmentModule {}
