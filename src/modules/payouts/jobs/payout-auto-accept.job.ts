import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PayoutService } from '../services/payout.service';

/**
 * #87 (FR-8.7, FR-8.9): Hourly sweep that marks PENDING payouts past their dispute window
 * (PAYOUT_DISPUTE_WINDOW_DAYS, default 7 days) as ACCEPTED. Disputed payouts are never
 * marked accepted by the passage of time.
 */
@Injectable()
export class PayoutAutoAcceptJob {
  constructor(
    private readonly payouts: PayoutService,
    @InjectPinoLogger(PayoutAutoAcceptJob.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'payout-auto-accept', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const accepted = await this.payouts.autoAcceptDuePayouts();
      if (accepted > 0) {
        this.logger.info({ accepted }, 'Marked overdue pending payouts accepted');
      }
    } catch (err) {
      this.logger.error({ err }, 'Payout auto-accept job failed');
    }
  }
}