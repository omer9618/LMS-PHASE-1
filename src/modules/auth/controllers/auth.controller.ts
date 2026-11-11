import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AllowWithoutMfa } from '../../../common/decorators/allow-without-mfa.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { LoginRateLimit, RateLimit } from '../../../common/rate-limit/rate-limits';
import {
  LoginInput,
  loginSchema,
  SwitchContextInput,
  switchContextSchema,
} from '../schemas/auth.schema';
import { MfaLoginInput, mfaLoginSchema } from '../schemas/mfa.schema';
import { AuthService, MeView, UserView } from '../services/auth.service';
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
  @LoginRateLimit()
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
  @RateLimit('LOGIN')
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
  me(@CurrentUser() user: AuthUser): MeView {
    return this.authService.describe(user);
  }

  /**
   * Who is signed in, answered with 200 either way: `{ user: null }` for a visitor. The web app
   * asks this on every page, and a 401 there would show as an error in every visitor's console.
   * Public, so it reads the session cookie itself; that also lets an admin who has not set up
   * two-step verification yet see who they are, which the MFA gate would otherwise refuse.
   */
  @Public()
  @Get('session')
  async session(@Req() req: Request): Promise<{ user: MeView | null }> {
    const user = await this.authService.authenticate(this.sessionCookie.read(req));
    return { user: user ? this.authService.describe(user) : null };
  }

  /** #109: switch an ADMIN+TEACHER session between the Admin and Teacher contexts. Audited. */
  @Post('context')
  @HttpCode(200)
  switchContext(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(switchContextSchema)) body: SwitchContextInput,
  ): Promise<MeView> {
    return this.authService.switchContext(user, body.role);
  }
}
