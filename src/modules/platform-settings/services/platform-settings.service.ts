import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformSettingDao } from '../dao/platform-setting.dao';
import {
  normaliseSettingValue,
  readSetting,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  SettingKey,
  SettingValue,
} from '../domain/settings.rules';

export interface SettingView {
  key: SettingKey;
  value: number | string | boolean;
  defaultValue: number | string | boolean;
  description: string;
  isDefault: boolean;
  updatedAt: Date | null;
  updatedBy: { id: string; email: string } | null;
}

/**
 * Typed access to platform settings for every module (`get`), and the admin editor (#8).
 * Reads go to the database each time, so an admin's change applies without a restart.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly settingDao: PlatformSettingDao,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const stored = await this.settingDao.getSettingBy(key);
    return readSetting(key, stored?.value);
  }

  async list(admin: AuthUser): Promise<SettingView[]> {
    adminScope(admin);
    const rows = await this.settingDao.getSettingsBy({ key: { in: SETTING_KEYS } });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      const value = readSetting(key, row?.value);
      const { defaultValue, description } = SETTING_DEFINITIONS[key];
      return {
        key,
        value,
        defaultValue,
        description,
        isDefault: value === defaultValue,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  async update(admin: AuthUser, key: string, value: unknown): Promise<SettingView> {
    adminScope(admin);
    const normalised = normaliseSettingValue(key, value);
    const previous = await this.settingDao.getSettingBy(normalised.key);

    await this.transactions.run(async (tx) => {
      await this.settingDao.upsertSetting(normalised.key, normalised.stored, admin.id, tx);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'SETTING_UPDATED',
          entityType: 'platform_setting',
          details: { key: normalised.key, from: previous?.value ?? null, to: normalised.stored },
        },
        tx,
      );
    });

    const views = await this.list(admin);
    return views.find((view) => view.key === normalised.key) as SettingView;
  }
}
