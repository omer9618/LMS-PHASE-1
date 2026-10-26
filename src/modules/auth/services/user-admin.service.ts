import { Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService, Paged } from '../../audit/services/audit.service';
import { EmailService } from '../../email/services/email.service';
import { AdminUserRecord, UserDao } from '../dao/user.dao';
import { TOKEN_TTL } from '../domain/password.rules';
import { assertCanRevokeRole, decideStatusChange } from '../domain/user-admin.rules';
import type { CreateAccountInput, ListUsersQuery } from '../schemas/user-admin.schema';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';

/** The admin view of an account: roles as a flat list. */
export type AdminUserView = Omit<AdminUserRecord, 'roles' | 'mfaEnabledAt'> & {
  roles: Role[];
  mfaEnabled: boolean;
};

export type StatusAction = 'SUSPEND' | 'REACTIVATE' | 'DEACTIVATE';

const STATUS_AUDIT_ACTION: Record<StatusAction, string> = {
  SUSPEND: 'USER_SUSPENDED',
  REACTIVATE: 'USER_REACTIVATED',
  DEACTIVATE: 'USER_DEACTIVATED',
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Admin account management (#15): create staff accounts, suspend and reactivate any account,
 * grant and revoke roles. Exported so Teacher Onboarding (#21, #22) reuses the same rules.
 */
@Injectable()
export class UserAdminService {
  constructor(
    private readonly userDao: UserDao,
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async listUsers(admin: AuthUser, query: ListUsersQuery): Promise<Paged<AdminUserView>> {
    adminScope(admin);
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.role ? { some: { role: query.role } } : undefined,
      OR: query.q
        ? [
            { email: { contains: query.q, mode: 'insensitive' } },
            { fullName: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.userDao.getAdminUsersBy(where, query),
      this.userDao.countUsersBy(where),
    ]);
    return { items: rows.map(toAdminView), total, limit: query.limit, offset: query.offset };
  }

  async getUser(admin: AuthUser, userId: string): Promise<AdminUserView> {
    adminScope(admin);
    return toAdminView(await this.loadUser(userId));
  }

  /**
   * #15/#21: creates an ADMIN and/or TEACHER account. The admin never chooses the password: the
   * new user receives a single-use link to set one.
   */
  async createAccount(admin: AuthUser, input: CreateAccountInput): Promise<AdminUserView> {
    adminScope(admin);
    if (await this.userDao.getUserBy({ email: input.email })) {
      throw new AppException(ErrorCode.CONFLICT, { field: 'email' }, undefined, {
        message: 'An account with this email already exists. Grant it a role instead.',
      });
    }

    const { userId, token } = await this.transactions.run(async (tx) => {
      const user = await this.userDao.createUser(
        {
          email: input.email,
          fullName: input.fullName,
          // Unusable until the user sets a password through the emailed link.
          passwordHash: '!',
          status: UserStatus.ACTIVE,
        },
        input.roles,
        tx,
      );
      const setupToken = await this.accountService.issuePasswordSetToken(
        user.id,
        TOKEN_TTL.ACCOUNT_SETUP_HOURS * HOUR_MS,
        tx,
      );
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'USER_CREATED',
          entityType: 'user',
          entityId: user.id,
          details: { roles: input.roles },
        },
        tx,
      );
      return { userId: user.id, token: setupToken };
    });

    await this.email.send(input.email, 'ACCOUNT_CREATED', {
      setPasswordUrl: this.email.appUrl('/reset-password', { token, welcome: '1' }),
      expiresInHours: TOKEN_TTL.ACCOUNT_SETUP_HOURS,
      roles: input.roles,
    });
    return this.getUser(admin, userId);
  }

  /**
   * Suspend, reactivate or deactivate an account, with a reason, audited. Leaving ACTIVE signs
   * the user out everywhere. Callers with extra preconditions (teacher deactivation, #22) check
   * them first and pass `tx` so the check and the change commit together.
   */
  async changeStatus(
    admin: AuthUser,
    userId: string,
    action: StatusAction,
    reason: string | undefined,
    tx?: TransactionClient,
  ): Promise<AdminUserView> {
    adminScope(admin);
    const run = async (t: TransactionClient) => {
      const target = await this.loadUser(userId);
      const activeAdmins = await this.countActiveAdmins(t);
      const to = decideStatusChange(admin.id, toTarget(target), action, activeAdmins);
      await this.userDao.updateUser(userId, { status: to }, t);
      if (to !== UserStatus.ACTIVE) await this.authService.revokeAllSessions(userId, t);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: STATUS_AUDIT_ACTION[action],
          entityType: 'user',
          entityId: userId,
          details: { from: target.status, to, ...(reason ? { reason } : {}) },
        },
        t,
      );
    };
    await (tx ? run(tx) : this.transactions.run(run));
    return this.getUser(admin, userId);
  }

  async grantRole(admin: AuthUser, userId: string, role: Role): Promise<AdminUserView> {
    adminScope(admin);
    const target = await this.loadUser(userId);
    if (target.roles.some((r) => r.role === role)) return toAdminView(target);
    await this.transactions.run(async (tx) => {
      await this.userDao.addRole(userId, role, tx);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'ROLE_GRANTED',
          entityType: 'user',
          entityId: userId,
          details: { role },
        },
        tx,
      );
    });
    return this.getUser(admin, userId);
  }

  async revokeRole(admin: AuthUser, userId: string, role: Role): Promise<AdminUserView> {
    adminScope(admin);
    await this.transactions.run(async (tx) => {
      const target = await this.loadUser(userId);
      assertCanRevokeRole(admin.id, toTarget(target), role, await this.countActiveAdmins(tx));
      await this.userDao.removeRole(userId, role, tx);
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'ROLE_REVOKED',
          entityType: 'user',
          entityId: userId,
          details: { role },
        },
        tx,
      );
    });
    return this.getUser(admin, userId);
  }

  private async loadUser(userId: string): Promise<AdminUserRecord> {
    const user = await this.userDao.getAdminUserBy({ id: userId });
    if (!user) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'user', id: userId });
    return user;
  }

  private countActiveAdmins(tx: TransactionClient): Promise<number> {
    return this.userDao.countUsersBy(
      { status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
      tx,
    );
  }
}

function toTarget(user: AdminUserRecord) {
  return { id: user.id, status: user.status, roles: user.roles.map((r) => r.role) };
}

function toAdminView(user: AdminUserRecord): AdminUserView {
  const { roles, mfaEnabledAt, ...rest } = user;
  return { ...rest, roles: roles.map((r) => r.role), mfaEnabled: mfaEnabledAt !== null };
}
