import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { TeacherApplicationService } from '../services/teacher-application.service';

/** #23: daily purge of rejected applications past their retention date (03:00 UTC). */
@Injectable()
export class ApplicationPurgeJob {
  constructor(
    private readonly applications: TeacherApplicationService,
    @InjectPinoLogger(ApplicationPurgeJob.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'application-purge', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      await this.applications.purgeExpired(null);
    } catch (err) {
      // A job must never crash the process; the next run retries whatever was left.
      this.logger.error({ err }, 'Application purge job failed');
    }
  }
}
