import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import {
  AdminOrdersController,
  CartController,
  MyOrdersController,
  OrdersController,
} from './controllers/orders.controller';
import { OrderDao } from './dao/order.dao';
import { OrderExpiryJob } from './jobs/order-expiry.job';
import { OrderService } from './services/order.service';

/** Orders and cart (#54-#62). */
@Module({
  imports: [AuditModule, CoursesModule, EnrollmentModule, PlatformSettingsModule],
  controllers: [CartController, OrdersController, MyOrdersController, AdminOrdersController],
  providers: [OrderService, OrderDao, OrderExpiryJob],
  // Contract: order reads, transitions and student emails for the verification module (#63-#67).
  exports: [OrderService],
})
export class OrdersModule {}
