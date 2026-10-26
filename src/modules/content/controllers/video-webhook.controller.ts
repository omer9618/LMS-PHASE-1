import { Controller, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { VideoProvider } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { VideoWebhookParams, videoWebhookParamsSchema } from '../schemas/content.schema';
import { VideoService } from '../services/video.service';

const PROVIDER_BY_SLUG: Record<VideoWebhookParams['provider'], VideoProvider> = {
  bunny: VideoProvider.BUNNY,
  'self-hosted': VideoProvider.SELF_HOSTED,
};

/**
 * #36: processing notifications from the video host. Authenticated by the provider's HMAC
 * signature over the raw body, not by a session; forged requests get 401 and change nothing.
 */
@Public()
@SkipThrottle()
@Controller('webhooks/video')
export class VideoWebhookController {
  constructor(private readonly videoService: VideoService) {}

  @Post(':provider')
  @HttpCode(204)
  async receive(
    @Param(new ZodValidationPipe(videoWebhookParamsSchema)) params: VideoWebhookParams,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<void> {
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
    const accepted = await this.videoService.handleWebhook(
      PROVIDER_BY_SLUG[params.provider],
      req.rawBody ?? Buffer.alloc(0),
      headers,
    );
    if (!accepted) throw new AppException(ErrorCode.UNAUTHENTICATED);
  }
}
