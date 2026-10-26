import type { VideoProvider as VideoProviderName } from '@prisma/client';
import type { VideoStatusValue } from '../domain/video.rules';

/** How the browser uploads the file straight to the provider (never through our server). */
export interface DirectUpload {
  protocol: 'tus';
  endpoint: string;
  /** Headers the TUS client must send with every request. */
  headers: Record<string, string>;
  /** Metadata the TUS client sends (Upload-Metadata). */
  metadata: Record<string, string>;
  expiresAt: Date;
}

export interface ProviderVideoState {
  status: VideoStatusValue;
  durationSeconds: number | null;
}

/** A provider's processing notification, after its signature was verified. */
export interface VideoWebhookEvent {
  providerVideoId: string;
  status: VideoStatusValue | null;
}

/**
 * One video host (#35). Everything provider-specific lives behind this interface, so switching
 * host is one new adapter; the rest of the platform stores `provider` + `provider_video_id` only.
 */
export interface VideoProvider {
  readonly name: VideoProviderName;
  /** Registers a new video and returns credentials for a direct browser upload. */
  createUpload(
    title: string,
    uploadTtlSeconds: number,
  ): Promise<{ providerVideoId: string; upload: DirectUpload }>;
  getState(providerVideoId: string): Promise<ProviderVideoState>;
  /** A signed, expiring player URL for exactly this video (#37). */
  embedUrl(providerVideoId: string, expiresInSeconds: number): string;
  /** Verifies and parses a webhook; null if the signature is wrong or the payload unusable. */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): VideoWebhookEvent | null;
}

export const VIDEO_PROVIDERS = Symbol('VIDEO_PROVIDERS');
