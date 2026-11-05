import { DomainError } from '../../../common/errors/domain.error';

/**
 * Role context for dual-role accounts (#109). Pure.
 *
 * An account holding both ADMIN and TEACHER works in one context at a time, chosen explicitly
 * with POST /auth/context and stored on the session. In the ADMIN context its TEACHER role is not
 * in effect, and the other way round, so admin routes need the ADMIN context and teacher routes
 * the TEACHER context. A mismatch is refused with ROLE_CONTEXT_REQUIRED naming the needed context;
 * the context never changes on its own. Accounts without both roles have no context and are not
 * affected.
 */
export type RoleValue = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type ContextRole = 'ADMIN' | 'TEACHER';

export const CONTEXT_ROLES: readonly ContextRole[] = ['ADMIN', 'TEACHER'];

/** The context of a new session (open question on #109: ADMIN until the client decides). */
export const DEFAULT_CONTEXT: ContextRole = 'ADMIN';

export class RoleContextNotApplicableError extends DomainError {
  readonly code = 'FORBIDDEN';
}

export function isContextRole(role: RoleValue | null | undefined): role is ContextRole {
  return role === 'ADMIN' || role === 'TEACHER';
}

export function isDualRole(held: ReadonlySet<RoleValue>): boolean {
  return CONTEXT_ROLES.every((role) => held.has(role));
}

/** The session's context: the stored one if valid, else the default; null if not dual-role. */
export function resolveContext(
  held: ReadonlySet<RoleValue>,
  stored: RoleValue | null,
): ContextRole | null {
  if (!isDualRole(held)) return null;
  return isContextRole(stored) ? stored : DEFAULT_CONTEXT;
}

/** The roles in effect for a request: the held roles minus the context that is not active. */
export function effectiveRoles<R extends RoleValue>(
  held: ReadonlySet<R>,
  context: ContextRole | null,
): Set<R> {
  if (context === null) return new Set(held);
  const inactive: ContextRole = context === 'ADMIN' ? 'TEACHER' : 'ADMIN';
  return new Set([...held].filter((role) => role !== inactive));
}

export function decideContextSwitch(
  held: ReadonlySet<RoleValue>,
  current: ContextRole | null,
  requested: ContextRole,
): { to: ContextRole; changed: boolean } {
  if (!isDualRole(held)) {
    throw new RoleContextNotApplicableError(
      'Only accounts holding both the Admin and Teacher roles switch context',
      { requested },
    );
  }
  return { to: requested, changed: current !== requested };
}

export type RouteRoleCheck =
  | { allowed: true }
  | { allowed: false; requiredContext: ContextRole }
  | { allowed: false; requiredContext: null };

/**
 * `@Roles(required)`: allowed if a role in effect matches. If only a held-but-inactive role
 * matches, the caller is in the wrong context and is told which one the route needs.
 */
export function checkRouteRoles(
  required: readonly RoleValue[],
  effective: ReadonlySet<RoleValue>,
  held: ReadonlySet<RoleValue>,
): RouteRoleCheck {
  if (required.some((role) => effective.has(role))) return { allowed: true };
  const needed = required.find(
    (role): role is ContextRole => isContextRole(role) && held.has(role),
  );
  return { allowed: false, requiredContext: needed ?? null };
}
