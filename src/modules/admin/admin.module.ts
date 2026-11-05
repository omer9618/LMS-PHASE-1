import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { OrdersModule } from '../orders/orders.module';
import { TeachersModule } from '../teachers/teachers.module';
import {
  AdminDashboardController,
  AdminUserOverviewController,
} from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUserOverviewService } from './services/admin-user-overview.service';

/**
 * Admin (#102, #103): the dashboard and cross-module admin views. Owns no tables: it reads
 * through other modules' exported services only.
 */
@Module({
  imports: [AuthModule, CoursesModule, EnrollmentModule, OrdersModule, TeachersModule],
  controllers: [AdminDashboardController, AdminUserOverviewController],
  providers: [AdminDashboardService, AdminUserOverviewService],
})
export class AdminModule {}
