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
const MINUTE_MS = 60 * 1000;

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

  /** Exact, case-insensitive (citext) lookup; null if no account has this email. */
  async findUserByEmail(admin: AuthUser, email: string): Promise<AdminUserView | null> {
    adminScope(admin);
    const user = await this.userDao.getAdminUserBy({ email });
    return user ? toAdminView(user) : null;
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
    const run = async (t: TransactionClient): Promise<AdminUserView> => {
      const target = await this.loadUser(userId, t);
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
      // Read back inside the same transaction: the caller's may not have committed yet.
      return toAdminView(await this.loadUser(userId, t));
    };
    return tx ? run(tx) : this.transactions.run(run);
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

  /**
   * #103: an admin sends the user a password reset link (e.g. a teacher who lost access).
   * The admin never sees or sets the password; the link is the same single-use, 30-minute link
   * as a self-service reset, and earlier unused links stop working. Audited. Active accounts only.
   */
  async sendPasswordReset(admin: AuthUser, userId: string): Promise<{ sent: boolean }> {
    adminScope(admin);
    const user = await this.loadUser(userId);
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.INVALID_STATE_TRANSITION,
        { status: user.status },
        undefined,
        {
          message: 'Reactivate the account before sending a password reset',
        },
      );
    }
    const token = await this.transactions.run(async (tx) => {
      const issued = await this.accountService.issuePasswordSetToken(
        user.id,
        TOKEN_TTL.PASSWORD_RESET_MINUTES * MINUTE_MS,
        tx,
      );
      await this.audit.record(
        {
          actorUserId: admin.id,
          action: 'USER_PASSWORD_RESET_SENT',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      );
      return issued;
    });
    const sent = await this.email.send(user.email, 'PASSWORD_RESET', {
      resetUrl: this.email.appUrl('/reset-password', { token }),
      expiresInMinutes: TOKEN_TTL.PASSWORD_RESET_MINUTES,
    });
    return { sent };
  }

  private async loadUser(userId: string, tx?: TransactionClient): Promise<AdminUserRecord> {
    const user = await this.userDao.getAdminUserBy({ id: userId }, tx);
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
