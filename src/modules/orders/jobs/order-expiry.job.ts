import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { OrderService } from '../services/order.service';

/**
 * #61: hourly sweep that lapses PENDING and REJECTED orders past their payment window
 * (ORDER_EXPIRY_WINDOW_HOURS) and emails each student. Orders awaiting an admin never lapse.
 */
@Injectable()
export class OrderExpiryJob {
  constructor(
    private readonly orders: OrderService,
    @InjectPinoLogger(OrderExpiryJob.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'order-expiry', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const lapsed = await this.orders.expireDueOrders();
      if (lapsed > 0) this.logger.info({ lapsed }, 'Marked overdue pending orders lapsed');
    } catch (err) {
      this.logger.error({ err }, 'Order expiry job failed');
    }
  }
}
