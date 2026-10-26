import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { VideoProvider as VideoProviderName } from '@prisma/client';
import type {
  DirectUpload,
  ProviderVideoState,
  VideoProvider,
  VideoWebhookEvent,
} from './video-provider';

/**
 * Development and tests only (refused in production by the env schema): no network, every video
 * becomes ready when its webhook arrives. Registered under SELF_HOSTED so dev rows can never be
 * mistaken for real Bunny videos. Webhooks are HMAC-signed like Bunny's, with a dev secret.
 */
export class FakeVideoProvider implements VideoProvider {
  readonly name = VideoProviderName.SELF_HOSTED;

  constructor(
    private readonly webhookSecret: string,
    private readonly apiPublicUrl: string,
  ) {}

  async createUpload(
    title: string,
    uploadTtlSeconds: number,
  ): Promise<{ providerVideoId: string; upload: DirectUpload }> {
    const providerVideoId = randomUUID();
    return {
      providerVideoId,
      upload: {
        protocol: 'tus',
        endpoint: new URL('/dev-video-upload', this.apiPublicUrl).toString(),
        headers: { VideoId: providerVideoId },
        metadata: { title },
        expiresAt: new Date(Date.now() + uploadTtlSeconds * 1000),
      },
    };
  }

  /** Like a real host, the API can lag behind the webhook; duration is a fixed ten minutes. */
  async getState(): Promise<ProviderVideoState> {
    return { status: 'PROCESSING', durationSeconds: 600 };
  }

  embedUrl(providerVideoId: string, expiresInSeconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `https://player.example.test/embed/${providerVideoId}?expires=${expires}`;
  }

  /** Signs a webhook body the way a test or dev tool would send it. */
  sign(rawBody: Buffer): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): VideoWebhookEvent | null {
    const given = Buffer.from(headers['x-fake-video-signature'] ?? '');
    const expected = Buffer.from(this.sign(rawBody));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      videoId: string;
      status: 'PROCESSING' | 'READY' | 'FAILED';
    };
    return { providerVideoId: payload.videoId, status: payload.status };
  }
}
