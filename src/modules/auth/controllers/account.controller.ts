import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../../common/rate-limit/rate-limits';
import {
  ConfirmPasswordResetInput,
  confirmPasswordResetSchema,
  RegisterInput,
  registerSchema,
  RequestPasswordResetInput,
  requestPasswordResetSchema,
  VerifyEmailInput,
  verifyEmailSchema,
} from '../schemas/auth.schema';
import { AccountService } from '../services/account.service';
import type { UserView } from '../services/auth.service';
import { SessionCookie } from '../session-cookie';

/** Registration and email verification (#11), password reset (#13). */
@Controller('auth')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  @Public()
  @RateLimit('REGISTER')
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserView }> {
    const grant = await this.accountService.register(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      currentToken: this.sessionCookie.read(req),
    });
    this.sessionCookie.set(res, grant.token, grant.expiresAt);
    return { user: grant.user };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<{ verified: true }> {
    return this.accountService.verifyEmail(body);
  }

  @RateLimit('ACCOUNT_EMAIL')
  @Post('verify-email/resend')
  @HttpCode(200)
  resendVerification(@CurrentUser() user: AuthUser): Promise<{ sent: boolean }> {
    return this.accountService.resendVerification(user);
  }

  @Public()
  @RateLimit('ACCOUNT_EMAIL')
  @Post('password-reset/request')
  @HttpCode(200)
  requestPasswordReset(
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) body: RequestPasswordResetInput,
  ): Promise<{ requested: true }> {
    return this.accountService.requestPasswordReset(body);
  }

  @Public()
  @RateLimit('LOGIN')
  @Post('password-reset/confirm')
  @HttpCode(200)
  confirmPasswordReset(
    @Body(new ZodValidationPipe(confirmPasswordResetSchema)) body: ConfirmPasswordResetInput,
  ): Promise<{ reset: true }> {
    return this.accountService.confirmPasswordReset(body);
  }
}
