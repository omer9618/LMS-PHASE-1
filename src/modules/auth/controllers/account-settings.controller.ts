import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../../common/rate-limit/rate-limits';
import {
  ChangePasswordInput,
  changePasswordSchema,
  SessionIdParams,
  sessionIdParamsSchema,
  UpdateAccountInput,
  updateAccountSchema,
} from '../schemas/auth.schema';
import { AccountSettingsService } from '../services/account-settings.service';
import { AuthService, MeView, SessionView } from '../services/auth.service';

/** The signed-in person's own account: password, name and the devices they are signed in on. */
@Controller('account')
export class AccountSettingsController {
  constructor(
    private readonly settings: AccountSettingsService,
    private readonly authService: AuthService,
  ) {}

  @RateLimit('PASSWORD_CHANGE')
  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<{ changed: true; otherSessionsEnded: number }> {
    return this.settings.changePassword(user, body);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput,
  ): Promise<MeView> {
    return this.settings.updateName(user, body);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser): Promise<SessionView[]> {
    return this.authService.listSessions(user);
  }

  /** Signs out every other device. Registered before the `:sessionId` route. */
  @Post('sessions/sign-out-others')
  @HttpCode(200)
  async signOutOthers(@CurrentUser() user: AuthUser): Promise<{ ended: number }> {
    const ended = await this.authService.revokeOtherSessions(user);
    return { ended };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(200)
  async signOutDevice(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(sessionIdParamsSchema)) params: SessionIdParams,
  ): Promise<{ ended: true }> {
    await this.authService.revokeOwnSession(user, params.sessionId);
    return { ended: true };
  }
}
