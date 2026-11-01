import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { AdminOrdersController, OrdersController } from './controllers/orders.controller';
import { OrderDao } from './dao/order.dao';
import { OrderService } from './services/order.service';

/** Orders and cart (#54-#62). */
@Module({
  imports: [AuditModule, CoursesModule, EnrollmentModule, PlatformSettingsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrderService, OrderDao],
  exports: [OrderService],
})
export class OrdersModule {}
