import type { Me } from './api/schemas/auth';

/**
 * Where someone lands after signing in when no page asked for them: staff go to their own area,
 * everyone else to the course catalogue. A dual-role account follows the context it works as.
 */
export function homePathFor(user: Pick<Me, 'roles' | 'activeContext'> | null): string {
  if (!user) return '/courses';
  if (user.activeContext === 'TEACHER') return '/teacher/courses';
  if (user.activeContext === 'ADMIN') return '/admin';
  if (user.roles.includes('ADMIN')) return '/admin';
  if (user.roles.includes('TEACHER')) return '/teacher/courses';
  return '/courses';
}
