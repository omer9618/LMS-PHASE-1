import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { VideoService } from '../services/video.service';

/** #36: every 10 minutes, re-check videos still processing (covers lost webhooks). */
@Injectable()
export class VideoSyncJob {
  constructor(
    private readonly videos: VideoService,
    @InjectPinoLogger(VideoSyncJob.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'video-sync', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      await this.videos.syncStuckVideos();
    } catch (err) {
      this.logger.error({ err }, 'Video sync job failed');
    }
  }
}
