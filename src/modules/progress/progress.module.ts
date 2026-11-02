import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import {
  LearnerOutlineController,
  LessonProgressController,
  TeacherProgressController,
} from './controllers/progress.controller';
import { ProgressDao } from './dao/progress.dao';
import { ProgressAccessService } from './services/progress-access.service';
import { ProgressService } from './services/progress.service';
import { TeacherProgressService } from './services/teacher-progress.service';

/**
 * Progress and progression (#90–#97) and checkpoint gating (#77).
 *
 * Dependency direction: content → progress → enrollment / platform-settings. Courses and
 * enrollment never import this module.
 */
@Module({
  imports: [EnrollmentModule, PlatformSettingsModule],
  controllers: [LearnerOutlineController, LessonProgressController, TeacherProgressController],
  providers: [ProgressService, TeacherProgressService, ProgressAccessService, ProgressDao],
  // Contract: the content gate asks ProgressAccessService.assertLessonUnlocked (#96, #77).
  exports: [ProgressAccessService],
})
export class ProgressModule {}
