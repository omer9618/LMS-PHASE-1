import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { LoginInput, loginSchema } from '../schemas/auth.schema';
import { AuthService, UserView } from '../services/auth.service';
import { SessionCookie } from '../session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserView }> {
    const result = await this.authService.login(body, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      currentToken: this.sessionCookie.read(req),
    });
    this.sessionCookie.set(res, result.token, result.expiresAt);
    return { user: result.user };
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

  @Get('me')
  me(@CurrentUser() user: AuthUser): UserView {
    return this.authService.describe(user);
  }
}
