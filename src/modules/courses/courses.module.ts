import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { TeacherCoursesController } from './controllers/teacher-courses.controller';
import { TeacherOutlineController } from './controllers/teacher-outline.controller';
import { CourseDao } from './dao/course.dao';
import { OutlineDao } from './dao/outline.dao';
import { CourseService } from './services/course.service';
import { OutlineService } from './services/outline.service';

@Module({
  imports: [AuditModule, ReferenceDataModule],
  controllers: [TeacherCoursesController, TeacherOutlineController, AdminCoursesController],
  providers: [CourseService, OutlineService, CourseDao, OutlineDao],
  // Contract: catalogue/orders will read courses through CourseService, never CourseDao.
  exports: [CourseService, OutlineService],
})
export class CoursesModule {}
