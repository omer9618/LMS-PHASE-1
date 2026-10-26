import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';

/**
 * Reads and writes the session cookie. HTTP-only always; Secure and SameSite from env.
 * Used by the auth controller and AuthGuard only: services never see Request or Response.
 */
@Injectable()
export class SessionCookie {
  private readonly name: string;
  private readonly options: CookieOptions;

  constructor(@Inject(ENV) env: Env) {
    this.name = env.SESSION_COOKIE_NAME;
    this.options = {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      path: '/',
    };
  }

  read(req: Request): string | undefined {
    const value: unknown = req.cookies?.[this.name];
    return typeof value === 'string' ? value : undefined;
  }

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(this.name, token, { ...this.options, expires: expiresAt });
  }

  clear(res: Response): void {
    res.clearCookie(this.name, this.options);
  }
}
