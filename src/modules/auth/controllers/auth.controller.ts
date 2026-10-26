import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AllowWithoutMfa } from '../../../common/decorators/allow-without-mfa.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { LoginInput, loginSchema } from '../schemas/auth.schema';
import { MfaLoginInput, mfaLoginSchema } from '../schemas/mfa.schema';
import { AuthService, UserView } from '../services/auth.service';
import { MfaService } from '../services/mfa.service';
import { SessionCookie } from '../session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserView } | { mfaRequired: true; challengeToken: string; expiresAt: Date }> {
    const outcome = await this.authService.login(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      currentToken: this.sessionCookie.read(req),
    });
    if (outcome.kind === 'mfa') {
      return {
        mfaRequired: true,
        challengeToken: outcome.challengeToken,
        expiresAt: outcome.expiresAt,
      };
    }
    this.sessionCookie.set(res, outcome.grant.token, outcome.grant.expiresAt);
    return { user: outcome.grant.user };
  }

  /** #16: second step of login for MFA accounts. */
  @Public()
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body(new ZodValidationPipe(mfaLoginSchema)) body: MfaLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserView }> {
    const grant = await this.mfaService.completeLogin(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      currentToken: this.sessionCookie.read(req),
    });
    this.sessionCookie.set(res, grant.token, grant.expiresAt);
    return { user: grant.user };
  }

  /** Public so an expired session can still clear its cookie. */
  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<null> {
    await this.authService.logout(this.sessionCookie.read(req));
    this.sessionCookie.clear(res);
    return null;
  }

  @AllowWithoutMfa()
  @Get('me')
  me(@CurrentUser() user: AuthUser): UserView & { mfaEnabled: boolean; mfaVerified: boolean } {
    return this.authService.describe(user);
  }
}
