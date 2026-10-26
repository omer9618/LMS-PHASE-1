import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/services/auth.service';
import { SessionCookie } from '../../modules/auth/session-cookie';
import { AllowWithoutMfa } from '../decorators/allow-without-mfa.decorator';
import { OptionalAuth } from '../decorators/optional-auth.decorator';
import { Public } from '../decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Global guard: every route requires a live session unless marked @Public() (#14).
 * Resolves the HTTP-only session cookie and attaches the caller to `req.user`.
 * Accounts holding ADMIN additionally need an MFA-verified session (#16), except on routes
 * marked @AllowWithoutMfa() (enrolment).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride(Public, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = await this.authService.authenticate(this.sessionCookie.read(req));
    const optional = this.reflector.getAllAndOverride(OptionalAuth, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!user) {
      if (optional) return true;
      throw new AppException(ErrorCode.UNAUTHENTICATED);
    }

    req.user = user;

    if (user.roles.has(Role.ADMIN) && !user.mfaVerified) {
      const allowed = this.reflector.getAllAndOverride(AllowWithoutMfa, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new AppException(ErrorCode.MFA_REQUIRED, { enrolled: user.mfaEnabled });
      }
    }
    return true;
  }
}
