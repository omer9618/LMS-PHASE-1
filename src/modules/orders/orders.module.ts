import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { OrdersController } from './controllers/orders.controller';
import { OrderService } from './services/order.service';

/** Orders and cart (#54-#62). */
@Module({
  imports: [CoursesModule, EnrollmentModule],
  controllers: [OrdersController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrdersModule {}
