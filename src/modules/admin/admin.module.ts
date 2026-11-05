import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { TeachersModule } from '../teachers/teachers.module';
import {
  AdminDashboardController,
  AdminFinanceController,
  AdminUserOverviewController,
} from './controllers/admin-dashboard.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminFinanceService } from './services/admin-finance.service';
import { AdminUserOverviewService } from './services/admin-user-overview.service';

/**
 * Admin (#102, #103, #104): the dashboard and cross-module admin views. Owns no tables: it reads
 * through other modules' exported services only.
 */
@Module({
  imports: [
    AuthModule,
    CoursesModule,
    EnrollmentModule,
    LedgerModule,
    OrdersModule,
    PayoutsModule,
    TeachersModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminUserOverviewController,
    AdminFinanceController,
  ],
  providers: [AdminDashboardService, AdminUserOverviewService, AdminFinanceService],
})
export class AdminModule {}