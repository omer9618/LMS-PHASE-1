import { Injectable } from '@nestjs/common';
import { LessonType, VideoProvider as VideoProviderName, VideoStatus } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { OutlineService } from '../../courses/services/outline.service';
import type { DirectUpload, VideoProvider } from '../adapters/video-provider';
import { VideoAssetDao, VideoAssetRecord } from '../dao/video-asset.dao';
import { nextVideoStatus, VideoStatusValue } from '../domain/video.rules';
import { ContentAccessService } from './content-access.service';
import { VideoProviderRegistry } from './video-provider.registry';

const UPLOAD_TTL_SECONDS = 24 * 60 * 60;
const PLAYBACK_TTL_SECONDS = 2 * 60 * 60;
/** The sync job re-checks videos stuck in processing for longer than this. */
const SYNC_AFTER_MS = 5 * 60 * 1000;
const SYNC_GIVE_UP_MS = 3 * 24 * 60 * 60 * 1000;

/** What teachers see about a lesson's video. */
export type VideoAssetView = VideoAssetRecord;

export interface UploadTicket {
  videoAssetId: string;
  upload: DirectUpload;
}

export interface Playback {
  embedUrl: string;
  expiresAt: Date;
  durationSeconds: number | null;
}

/**
 * Lesson videos (#35–#37): direct-to-provider uploads, processing state (webhook + sync job),
 * and signed playback.
 */
@Injectable()
export class VideoService {
  constructor(
    private readonly providers: VideoProviderRegistry,
    private readonly assetDao: VideoAssetDao,
    private readonly outline: OutlineService,
    private readonly access: ContentAccessService,
    private readonly transactions: TransactionService,
    @InjectPinoLogger(VideoService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * #36: registers a video with the provider and returns credentials for the browser to upload
   * the file directly. The asset is attached to the lesson at once (status PROCESSING), replacing
   * any previous video. Videos are only ever attached this way, never by client-supplied id.
   */
  async startUpload(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    title: string | undefined,
  ): Promise<UploadTicket> {
    const lesson = await this.outline.loadEditableLesson(user, courseId, lessonId);
    if (lesson.type !== LessonType.VIDEO) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'type' }, undefined, {
        message: 'Only video lessons have a video',
      });
    }

    const provider = this.providers.forUploads();
    const { providerVideoId, upload } = await provider.createUpload(
      title ?? lesson.title,
      UPLOAD_TTL_SECONDS,
    );
    const asset = await this.transactions.run(async (tx) => {
      const created = await this.assetDao.createAsset(
        { provider: provider.name, providerVideoId, status: VideoStatus.PROCESSING },
        tx,
      );
      await this.outline.setLessonVideo(lessonId, created.id, tx);
      return created;
    });
    return { videoAssetId: asset.id, upload };
  }

  /** Asks the provider for the current state (fallback when a webhook was missed). */
  async refresh(user: AuthUser, courseId: string, lessonId: string): Promise<VideoAssetView> {
    const lesson = await this.outline.loadEditableLesson(user, courseId, lessonId);
    const asset = lesson.videoAsset ? await this.assetDao.getAssetBy(lesson.videoAsset.id) : null;
    if (!asset) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'video', lessonId });
    return this.syncAsset(asset);
  }

  /** #37: a signed, expiring embed URL, issued only after the access check. */
  async playback(
    user: AuthUser | undefined,
    courseId: string,
    lessonId: string,
  ): Promise<Playback> {
    const lesson = await this.access.assertCanPlay(user, courseId, lessonId);
    const video = lesson.videoAsset;
    if (!video || video.status !== VideoStatus.READY) {
      throw new AppException(ErrorCode.VIDEO_NOT_READY, { status: video?.status ?? null });
    }
    const provider = this.providers.forAsset(video.provider);
    return {
      embedUrl: provider.embedUrl(video.providerVideoId, PLAYBACK_TTL_SECONDS),
      expiresAt: new Date(Date.now() + PLAYBACK_TTL_SECONDS * 1000),
      durationSeconds: video.durationSeconds,
    };
  }

  /**
   * #36: a provider's processing notification. Returns false when the signature is invalid (the
   * controller answers 401) so forged events change nothing.
   */
  async handleWebhook(
    providerName: VideoProviderName,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<boolean> {
    const provider = this.providers.forAsset(providerName);
    const event = provider.parseWebhook(rawBody, headers);
    if (!event) {
      this.logger.warn({ provider: providerName }, 'Rejected video webhook (bad signature)');
      return false;
    }
    if (!event.status) return true;

    const asset = await this.assetDao.getAssetByProviderId(providerName, event.providerVideoId);
    if (!asset) {
      this.logger.warn({ providerVideoId: event.providerVideoId }, 'Webhook for unknown video');
      return true;
    }
    // The signed event decides the status. Once ready, ask the API for the duration only:
    // its own status can lag behind the webhook.
    let durationSeconds = asset.durationSeconds;
    if (event.status === 'READY') {
      try {
        const state = await this.providers.forAsset(providerName).getState(asset.providerVideoId);
        durationSeconds = state.durationSeconds ?? durationSeconds;
      } catch (err) {
        this.logger.warn({ err, videoAssetId: asset.id }, 'Could not read video duration');
      }
    }
    await this.applyStatus(asset, event.status, durationSeconds);
    return true;
  }

  /** Job: re-check videos still processing after a while, so a lost webhook never strands one. */
  async syncStuckVideos(now = new Date()): Promise<number> {
    const stuck = await this.assetDao.getAssetsBy(
      {
        status: VideoStatus.PROCESSING,
        createdAt: {
          lt: new Date(now.getTime() - SYNC_AFTER_MS),
          gt: new Date(now.getTime() - SYNC_GIVE_UP_MS),
        },
      },
      50,
    );
    for (const asset of stuck) {
      try {
        await this.syncAsset(asset);
      } catch (err) {
        this.logger.error({ err, videoAssetId: asset.id }, 'Video status sync failed');
      }
    }
    return stuck.length;
  }

  private async syncAsset(asset: VideoAssetRecord): Promise<VideoAssetRecord> {
    const provider: VideoProvider = this.providers.forAsset(asset.provider);
    const state = await provider.getState(asset.providerVideoId);
    return this.applyStatus(asset, state.status, state.durationSeconds ?? asset.durationSeconds);
  }

  private applyStatus(
    asset: VideoAssetRecord,
    incoming: VideoStatusValue,
    durationSeconds: number | null,
  ): Promise<VideoAssetRecord> {
    return this.assetDao.updateAsset(asset.id, {
      status: nextVideoStatus(asset.status, incoming),
      durationSeconds,
    });
  }
}
