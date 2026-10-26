import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AllowWithoutMfa } from '../../../common/decorators/allow-without-mfa.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../../common/rate-limit/rate-limits';
import { MfaCodeInput, mfaCodeSchema } from '../schemas/mfa.schema';
import { MfaService, MfaStatus } from '../services/mfa.service';

/** #16: TOTP enrolment and management for the signed-in user. Code guessing is limited. */
@RateLimit('LOGIN')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @AllowWithoutMfa()
  @Get()
  status(@CurrentUser() user: AuthUser): Promise<MfaStatus> {
    return this.mfaService.status(user);
  }

  @AllowWithoutMfa()
  @Post('setup')
  @HttpCode(200)
  setup(@CurrentUser() user: AuthUser): Promise<{ secret: string; otpauthUri: string }> {
    return this.mfaService.setup(user);
  }

  @AllowWithoutMfa()
  @Post('enable')
  @HttpCode(200)
  enable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeInput,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.mfaService.enable(user, body);
  }

  @Post('disable')
  @HttpCode(200)
  disable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeInput,
  ): Promise<{ enabled: false }> {
    return this.mfaService.disable(user, body);
  }

  @Post('recovery-codes')
  @HttpCode(200)
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeInput,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.mfaService.regenerateRecoveryCodes(user, body);
  }
}
