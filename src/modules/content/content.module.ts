import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { BunnyStreamProvider } from './adapters/bunny-stream.provider';
import { FakeVideoProvider } from './adapters/fake-video.provider';
import { VIDEO_PROVIDERS, VideoProvider } from './adapters/video-provider';
import { LessonContentController } from './controllers/lesson-content.controller';
import { TeacherContentController } from './controllers/teacher-content.controller';
import { VideoWebhookController } from './controllers/video-webhook.controller';
import { LessonResourceDao } from './dao/lesson-resource.dao';
import { VideoAssetDao } from './dao/video-asset.dao';
import { VideoSyncJob } from './jobs/video-sync.job';
import { ContentAccessService } from './services/content-access.service';
import { ResourceService } from './services/resource.service';
import { VideoProviderRegistry } from './services/video-provider.registry';
import { VideoService } from './services/video.service';

/** The first provider receives new uploads (#35). Production: Bunny only. */
function createVideoProviders(env: Env): VideoProvider[] {
  if (env.VIDEO_PROVIDER === 'bunny') {
    return [
      new BunnyStreamProvider({
        libraryId: env.BUNNY_LIBRARY_ID as string,
        apiKey: env.BUNNY_API_KEY as string,
        readOnlyApiKey: env.BUNNY_READONLY_API_KEY as string,
        tokenAuthKey: env.BUNNY_TOKEN_AUTH_KEY as string,
      }),
    ];
  }
  return [new FakeVideoProvider(env.FAKE_VIDEO_WEBHOOK_SECRET, env.API_PUBLIC_URL)];
}

/** Content (#35–#39): lesson videos and resources, and the server-side access gate. */
@Module({
  imports: [CoursesModule, EnrollmentModule],
  controllers: [TeacherContentController, LessonContentController, VideoWebhookController],
  providers: [
    { provide: VIDEO_PROVIDERS, inject: [ENV], useFactory: createVideoProviders },
    VideoProviderRegistry,
    VideoService,
    ResourceService,
    ContentAccessService,
    VideoAssetDao,
    LessonResourceDao,
    VideoSyncJob,
  ],
  exports: [ContentAccessService],
})
export class ContentModule {}
