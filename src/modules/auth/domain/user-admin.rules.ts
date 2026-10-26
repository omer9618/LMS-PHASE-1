import { DomainError } from '../../../common/errors/domain.error';

/**
 * Rules for admins managing accounts (#15, #22). Pure: the service supplies the counts.
 * Status meanings: ACTIVE; SUSPENDED (temporarily blocked, reversible); DELETED (deactivated:
 * the account is closed but its records remain, since financial and audit rows are never deleted).
 */
export type UserStatusValue = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type RoleValue = 'ADMIN' | 'TEACHER' | 'STUDENT';

export class AccountChangeRefusedError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
}

export interface AccountTarget {
  id: string;
  status: UserStatusValue;
  roles: RoleValue[];
}

const STATUS_TRANSITIONS: Record<'SUSPEND' | 'REACTIVATE' | 'DEACTIVATE', UserStatusValue[]> = {
  SUSPEND: ['ACTIVE'],
  REACTIVATE: ['SUSPENDED', 'DELETED'],
  DEACTIVATE: ['ACTIVE', 'SUSPENDED'],
};

const RESULT: Record<keyof typeof STATUS_TRANSITIONS, UserStatusValue> = {
  SUSPEND: 'SUSPENDED',
  REACTIVATE: 'ACTIVE',
  DEACTIVATE: 'DELETED',
};

/**
 * Decides a status change. Nobody may change their own status, and the platform must always keep
 * at least one active admin.
 */
export function decideStatusChange(
  actorId: string,
  target: AccountTarget,
  action: keyof typeof STATUS_TRANSITIONS,
  activeAdminCount: number,
): UserStatusValue {
  if (actorId === target.id) {
    throw new AccountChangeRefusedError('You cannot change the status of your own account');
  }
  if (!STATUS_TRANSITIONS[action].includes(target.status)) {
    throw new AccountChangeRefusedError(
      `Cannot ${action.toLowerCase()} an account that is ${target.status}`,
      { from: target.status, action },
    );
  }
  const removesActiveAdmin =
    action !== 'REACTIVATE' && target.status === 'ACTIVE' && target.roles.includes('ADMIN');
  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new AccountChangeRefusedError('The platform must keep at least one active admin');
  }
  return RESULT[action];
}

/** Revoking a role: never your own ADMIN, never the last active admin, never the last role. */
export function assertCanRevokeRole(
  actorId: string,
  target: AccountTarget,
  role: RoleValue,
  activeAdminCount: number,
): void {
  if (!target.roles.includes(role)) {
    throw new AccountChangeRefusedError(`The account does not hold ${role}`);
  }
  if (target.roles.length === 1) {
    throw new AccountChangeRefusedError('An account must keep at least one role');
  }
  if (role === 'ADMIN' && actorId === target.id) {
    throw new AccountChangeRefusedError('You cannot remove your own admin role');
  }
  if (role === 'ADMIN' && target.status === 'ACTIVE' && activeAdminCount <= 1) {
    throw new AccountChangeRefusedError('The platform must keep at least one active admin');
  }
}
