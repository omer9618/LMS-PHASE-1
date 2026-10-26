import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Global guard, runs after AuthGuard. Enforces @Roles(...) as "holds at least one of".
 * This is route-level only; decisions about specific records (ownership) live in services/DAOs.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new AppException(ErrorCode.UNAUTHENTICATED);
    if (!required.some((role) => user.roles.has(role))) {
      throw new AppException(ErrorCode.FORBIDDEN, { requiredAnyOf: required });
    }
    return true;
  }
}
