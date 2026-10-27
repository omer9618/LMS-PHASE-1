import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EnrollmentService } from '../services/enrollment.service';

/**
 * #51: hourly, marks enrollments past their expiry as EXPIRED. Access is already denied by date at
 * every gate; this keeps the stored status, lists and reports truthful.
 */
@Injectable()
export class EnrollmentExpiryJob {
  constructor(
    private readonly enrollments: EnrollmentService,
    @InjectPinoLogger(EnrollmentExpiryJob.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'enrollment-expiry', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      const expired = await this.enrollments.expireDue();
      if (expired > 0) this.logger.info({ expired }, 'Marked enrollments expired');
    } catch (err) {
      this.logger.error({ err }, 'Enrollment expiry job failed');
    }
  }
}
