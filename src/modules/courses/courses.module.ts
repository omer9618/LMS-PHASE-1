import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { AdminCoursesController } from './controllers/admin-courses.controller';
import { TeacherCoursesController } from './controllers/teacher-courses.controller';
import { CourseDao } from './dao/course.dao';
import { CourseService } from './services/course.service';

@Module({
  imports: [AuditModule, ReferenceDataModule],
  controllers: [TeacherCoursesController, AdminCoursesController],
  providers: [CourseService, CourseDao],
  // Contract: catalogue/orders will read courses through CourseService, never CourseDao.
  exports: [CourseService],
})
export class CoursesModule {}
