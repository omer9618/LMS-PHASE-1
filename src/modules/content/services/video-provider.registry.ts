import { Inject, Injectable } from '@nestjs/common';
import { VideoProvider as VideoProviderName } from '@prisma/client';
import { VIDEO_PROVIDERS, VideoProvider } from '../adapters/video-provider';

/**
 * The single resolver (#35): an asset's stored `provider` picks its adapter. New uploads go to
 * the first registered provider (Bunny in production, the fake in dev/tests).
 */
@Injectable()
export class VideoProviderRegistry {
  private readonly byName: Map<VideoProviderName, VideoProvider>;

  constructor(@Inject(VIDEO_PROVIDERS) private readonly providers: VideoProvider[]) {
    this.byName = new Map(providers.map((p) => [p.name, p]));
  }

  forUploads(): VideoProvider {
    return this.providers[0];
  }

  forAsset(name: VideoProviderName): VideoProvider {
    const provider = this.byName.get(name);
    if (!provider) throw new Error(`No video provider adapter registered for ${name}`);
    return provider;
  }
}
