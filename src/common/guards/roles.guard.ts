import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { checkRouteRoles } from '../../modules/auth/domain/role-context.rules';
import { Roles } from '../decorators/roles.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Global guard, runs after AuthGuard. Enforces @Roles(...) as "has at least one of, in effect".
 * This is route-level only; decisions about specific records (ownership) live in services/DAOs.
 *
 * #109: an ADMIN+TEACHER account has only its active context's role in effect. If the route needs
 * the other one, the answer is 403 ROLE_CONTEXT_REQUIRED naming the context to switch to, never a
 * silent switch.
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
    const check = checkRouteRoles(required, user.roles, user.heldRoles);
    if (check.allowed) return true;
    if (check.requiredContext) {
      throw new AppException(ErrorCode.ROLE_CONTEXT_REQUIRED, {
        requiredContext: check.requiredContext,
        activeContext: user.activeContext,
      });
    }
    throw new AppException(ErrorCode.FORBIDDEN, { requiredAnyOf: required });
  }
}
