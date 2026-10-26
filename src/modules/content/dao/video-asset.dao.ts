import { Injectable } from '@nestjs/common';
import { Prisma, VideoProvider } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const assetSelect = {
  id: true,
  provider: true,
  providerVideoId: true,
  status: true,
  durationSeconds: true,
  createdAt: true,
} satisfies Prisma.VideoAssetSelect;

export type VideoAssetRecord = Prisma.VideoAssetGetPayload<{ select: typeof assetSelect }>;

@Injectable()
export class VideoAssetDao {
  constructor(private readonly prisma: PrismaService) {}

  createAsset(
    data: Prisma.VideoAssetUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<VideoAssetRecord> {
    return (tx ?? this.prisma).videoAsset.create({ data, select: assetSelect });
  }

  getAssetBy(id: string): Promise<VideoAssetRecord | null> {
    return this.prisma.videoAsset.findUnique({ where: { id }, select: assetSelect });
  }

  getAssetByProviderId(
    provider: VideoProvider,
    providerVideoId: string,
  ): Promise<VideoAssetRecord | null> {
    return this.prisma.videoAsset.findFirst({
      where: { provider, providerVideoId },
      select: assetSelect,
    });
  }

  getAssetsBy(where: Prisma.VideoAssetWhereInput, limit: number): Promise<VideoAssetRecord[]> {
    return this.prisma.videoAsset.findMany({
      where,
      select: assetSelect,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  updateAsset(
    id: string,
    data: Prisma.VideoAssetUncheckedUpdateInput,
    tx?: TransactionClient,
  ): Promise<VideoAssetRecord> {
    return (tx ?? this.prisma).videoAsset.update({ where: { id }, data, select: assetSelect });
  }
}
