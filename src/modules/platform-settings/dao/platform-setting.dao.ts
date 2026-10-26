import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const settingSelect = {
  key: true,
  value: true,
  updatedAt: true,
  updatedBy: { select: { id: true, email: true } },
} satisfies Prisma.PlatformSettingSelect;

export type PlatformSettingRecord = Prisma.PlatformSettingGetPayload<{
  select: typeof settingSelect;
}>;

@Injectable()
export class PlatformSettingDao {
  constructor(private readonly prisma: PrismaService) {}

  getSettingsBy(where: Prisma.PlatformSettingWhereInput): Promise<PlatformSettingRecord[]> {
    return this.prisma.platformSetting.findMany({ where, select: settingSelect });
  }

  getSettingBy(key: string): Promise<PlatformSettingRecord | null> {
    return this.prisma.platformSetting.findUnique({ where: { key }, select: settingSelect });
  }

  upsertSetting(
    key: string,
    value: string,
    updatedById: string,
    tx?: TransactionClient,
  ): Promise<PlatformSettingRecord> {
    return (tx ?? this.prisma).platformSetting.upsert({
      where: { key },
      update: { value, updatedById },
      create: { key, value, updatedById },
      select: settingSelect,
    });
  }
}
