import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformSettingsController } from './controllers/platform-settings.controller';
import { PlatformSettingDao } from './dao/platform-setting.dao';
import { PlatformSettingsService } from './services/platform-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService, PlatformSettingDao],
  // Contract: other modules read settings through PlatformSettingsService.get(key).
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
