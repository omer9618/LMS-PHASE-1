import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { VideoProvider as VideoProviderName } from '@prisma/client';
import { videoStatusFromBunnyApi, videoStatusFromBunnyWebhook } from '../domain/video.rules';
import type {
  DirectUpload,
  ProviderVideoState,
  VideoProvider,
  VideoWebhookEvent,
} from './video-provider';

export interface BunnyStreamConfig {
  libraryId: string;
  /** Library API key: server calls and the TUS upload signature. */
  apiKey: string;
  /** Library Read-Only API key: verifies webhook signatures. */
  readOnlyApiKey: string;
  /** Security > Token authentication key: signs player embed URLs. */
  tokenAuthKey: string;
  apiBaseUrl?: string;
  playerBaseUrl?: string;
}

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Bunny Stream (#36, #37). Formulas follow bunny.net/docs (fetched 2026-10-26):
 * - create video: POST {api}/library/{libraryId}/videos, header AccessKey, body { title } -> guid
 * - TUS upload: https://video.bunnycdn.com/tusupload with AuthorizationSignature =
 *   sha256_hex(libraryId + apiKey + expires + videoId), AuthorizationExpire, VideoId, LibraryId
 * - get video: GET {api}/library/{libraryId}/videos/{videoId} -> status, length (seconds)
 * - embed token: sha256_hex(tokenAuthKey + videoId + expires), query token & expires (seconds)
 * - webhook: X-BunnyStream-Signature = hex HMAC-SHA256(raw body, read-only API key)
 */
export class BunnyStreamProvider implements VideoProvider {
  readonly name = VideoProviderName.BUNNY;
  private readonly apiBaseUrl: string;
  private readonly playerBaseUrl: string;

  constructor(
    private readonly config: BunnyStreamConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://video.bunnycdn.com';
    this.playerBaseUrl = config.playerBaseUrl ?? 'https://player.mediadelivery.net';
  }

  async createUpload(
    title: string,
    uploadTtlSeconds: number,
  ): Promise<{ providerVideoId: string; upload: DirectUpload }> {
    const res = await this.fetchImpl(`${this.apiBaseUrl}/library/${this.config.libraryId}/videos`, {
      method: 'POST',
      headers: {
        AccessKey: this.config.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Bunny create video failed: HTTP ${res.status}`);
    const video = (await res.json()) as { guid?: unknown };
    if (typeof video.guid !== 'string') throw new Error('Bunny create video returned no guid');

    const expires = Math.floor(Date.now() / 1000) + uploadTtlSeconds;
    return {
      providerVideoId: video.guid,
      upload: {
        protocol: 'tus',
        endpoint: `${this.apiBaseUrl}/tusupload`,
        headers: {
          AuthorizationSignature: sha256Hex(
            `${this.config.libraryId}${this.config.apiKey}${expires}${video.guid}`,
          ),
          AuthorizationExpire: String(expires),
          VideoId: video.guid,
          LibraryId: this.config.libraryId,
        },
        metadata: { title },
        expiresAt: new Date(expires * 1000),
      },
    };
  }

  async getState(providerVideoId: string): Promise<ProviderVideoState> {
    const res = await this.fetchImpl(
      `${this.apiBaseUrl}/library/${this.config.libraryId}/videos/${providerVideoId}`,
      {
        headers: { AccessKey: this.config.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Bunny get video failed: HTTP ${res.status}`);
    const video = (await res.json()) as { status?: unknown; length?: unknown };
    return {
      status: videoStatusFromBunnyApi(typeof video.status === 'number' ? video.status : 0),
      durationSeconds: typeof video.length === 'number' && video.length > 0 ? video.length : null,
    };
  }

  embedUrl(providerVideoId: string, expiresInSeconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = sha256Hex(`${this.config.tokenAuthKey}${providerVideoId}${expires}`);
    const url = new URL(`/embed/${this.config.libraryId}/${providerVideoId}`, this.playerBaseUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('expires', String(expires));
    return url.toString();
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): VideoWebhookEvent | null {
    if (headers['x-bunnystream-signature-version'] !== 'v1') return null;
    if (headers['x-bunnystream-signature-algorithm'] !== 'hmac-sha256') return null;
    const given = headers['x-bunnystream-signature'] ?? '';
    const expected = createHmac('sha256', this.config.readOnlyApiKey).update(rawBody).digest('hex');
    if (
      given.length !== expected.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      return null;
    }

    try {
      const payload = JSON.parse(rawBody.toString('utf8')) as {
        VideoLibraryId?: unknown;
        VideoGuid?: unknown;
        Status?: unknown;
      };
      if (String(payload.VideoLibraryId) !== this.config.libraryId) return null;
      if (typeof payload.VideoGuid !== 'string' || typeof payload.Status !== 'number') return null;
      return {
        providerVideoId: payload.VideoGuid,
        status: videoStatusFromBunnyWebhook(payload.Status),
      };
    } catch {
      return null;
    }
  }
}
