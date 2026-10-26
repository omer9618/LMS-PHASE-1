import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { AdminTeacherApplicationsController } from './controllers/admin-teacher-applications.controller';
import { AdminTeachersController } from './controllers/admin-teachers.controller';
import { TeacherApplicationsController } from './controllers/teacher-applications.controller';
import { TeacherApplicationDao } from './dao/teacher-application.dao';
import { ApplicationPurgeJob } from './jobs/application-purge.job';
import { TeacherAdminService } from './services/teacher-admin.service';
import { TeacherApplicationService } from './services/teacher-application.service';

/** Teacher Onboarding (#18–#23). */
@Module({
  imports: [AuditModule, AuthModule, CoursesModule, PlatformSettingsModule],
  controllers: [
    TeacherApplicationsController,
    AdminTeacherApplicationsController,
    AdminTeachersController,
  ],
  providers: [
    TeacherApplicationService,
    TeacherAdminService,
    TeacherApplicationDao,
    ApplicationPurgeJob,
  ],
})
export class TeachersModule {}
