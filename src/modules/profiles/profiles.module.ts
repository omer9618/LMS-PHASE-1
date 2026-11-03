import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { AdminTeacherProfilesController } from './controllers/admin-teacher-profiles.controller';
import { PublicTeachersController } from './controllers/public-teachers.controller';
import { TeacherProfileController } from './controllers/teacher-profile.controller';
import { TeacherProfileDao } from './dao/teacher-profile.dao';
import { TeacherProfileService } from './services/teacher-profile.service';

/** Profiles (#98–#101): teacher public profiles, their public page and admin moderation. */
@Module({
  imports: [AuditModule, AuthModule, CatalogueModule],
  controllers: [TeacherProfileController, PublicTeachersController, AdminTeacherProfilesController],
  providers: [TeacherProfileService, TeacherProfileDao],
  exports: [TeacherProfileService],
})
export class ProfilesModule {}
