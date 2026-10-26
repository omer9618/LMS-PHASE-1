import { Role } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import type { AuthUser } from './auth-user';

/**
 * Required argument of every DAO method that reads or writes teacher-owned data (#14).
 * There is no overload without it, so forgetting to scope a query is a compile error.
 *
 * Build one with `teacherScope(user)` or `adminScope(user)`; both re-check the role, so a scope
 * can never be wider than the caller's roles even if a route's @Roles is wrong.
 */
export type TeacherOwnerScope = { readonly teacherId: string };
export type AdminScope = { readonly admin: true };
export type TeacherScope = TeacherOwnerScope | AdminScope;

export function teacherScope(user: AuthUser): TeacherOwnerScope {
  if (!user.roles.has(Role.TEACHER)) {
    throw new AppException(ErrorCode.FORBIDDEN, { requiredRole: Role.TEACHER });
  }
  return { teacherId: user.id };
}

export function adminScope(user: AuthUser): AdminScope {
  if (!user.roles.has(Role.ADMIN)) {
    throw new AppException(ErrorCode.FORBIDDEN, { requiredRole: Role.ADMIN });
  }
  return { admin: true };
}

/** Prisma `where` fragment for a scope. Spread into the where clause of teacher-owned models. */
export function scopeWhere(scope: TeacherScope): { teacherId?: string } {
  return 'teacherId' in scope ? { teacherId: scope.teacherId } : {};
}
