import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AllowWithoutMfa } from '../../../common/decorators/allow-without-mfa.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  LessonContentParams,
  lessonContentParamsSchema,
  ResourceParams,
  resourceParamsSchema,
} from '../schemas/content.schema';
import { ResourceService } from '../services/resource.service';
import { Playback, VideoService } from '../services/video.service';

/** Learner-facing content. Every request is authorised server-side (#39). */
@Controller('courses/:courseId/lessons/:lessonId')
export class LessonContentController {
  constructor(
    private readonly videoService: VideoService,
    private readonly resourceService: ResourceService,
  ) {}

  /**
   * #37: signed player URL. Visitors may play free-preview lessons of a published course (the
   * demo); everything else needs an enrollment or a staff role.
   */
  @OptionalAuth()
  @AllowWithoutMfa()
  @Get('playback')
  playback(
    @Req() req: Request,
    @Param(new ZodValidationPipe(lessonContentParamsSchema)) params: LessonContentParams,
  ): Promise<Playback> {
    return this.videoService.playback(req.user, params.courseId, params.lessonId);
  }

  /** #39: resource downloads need an active enrollment (or a staff role). */
  @Get('resources/:resourceId/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(resourceParamsSchema)) params: ResourceParams,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.resourceService.downloadUrl(
      user,
      params.courseId,
      params.lessonId,
      params.resourceId,
    );
  }
}
