import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** The authenticated caller. Throws on @Public routes, where there is no user. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED);
    return user;
  },
);
