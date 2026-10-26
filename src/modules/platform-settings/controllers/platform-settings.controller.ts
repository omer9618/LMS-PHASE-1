import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  SettingKeyParams,
  settingKeyParamsSchema,
  UpdateSettingInput,
  updateSettingSchema,
} from '../schemas/platform-settings.schema';
import { PlatformSettingsService, SettingView } from '../services/platform-settings.service';

/** #8: platform settings editor. */
@Roles([Role.ADMIN])
@Controller('admin/settings')
export class PlatformSettingsController {
  constructor(private readonly settingsService: PlatformSettingsService) {}

  @Get()
  list(@CurrentUser() admin: AuthUser): Promise<SettingView[]> {
    return this.settingsService.list(admin);
  }

  @Put(':key')
  update(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(settingKeyParamsSchema)) params: SettingKeyParams,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: UpdateSettingInput,
  ): Promise<SettingView> {
    return this.settingsService.update(admin, params.key, body.value);
  }
}
