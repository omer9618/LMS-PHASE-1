import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { EmailService } from '../../email/services/email.service';
import { UserDao } from '../dao/user.dao';
import { assertAcceptablePassword } from '../domain/password.rules';
import type { ChangePasswordInput, UpdateAccountInput } from '../schemas/auth.schema';
import { AuthService, MeView } from './auth.service';
import { hashPassword, verifyPassword } from './passwords';

/** A field-level validation error, shaped like the ones the validation pipe returns. */
function fieldError(path: string, message: string): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, {
    location: 'body',
    issues: [{ path, code: 'custom', message }],
  });
}

/** What a signed-in person can do to their own account: change the password and the name. */
@Injectable()
export class AccountSettingsService {
  constructor(
    private readonly userDao: UserDao,
    private readonly authService: AuthService,
    private readonly transactions: TransactionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Changes the password after checking the current one, signs every other device out (the one
   * in use stays signed in), audits it and tells the owner by email, so a stolen session cannot
   * quietly take the account over.
   */
  async changePassword(
    user: AuthUser,
    input: ChangePasswordInput,
  ): Promise<{ changed: true; otherSessionsEnded: number }> {
    const credentials = await this.userDao.getUserCredentialsByEmail(user.email);
    const currentMatches =
      credentials !== null &&
      (await verifyPassword(input.currentPassword, credentials.passwordHash));
    if (!currentMatches)
      throw fieldError('currentPassword', 'Your current password is not correct');
    if (input.newPassword === input.currentPassword) {
      throw fieldError('newPassword', 'Choose a password you are not already using');
    }
    assertAcceptablePassword(input.newPassword, user.email);
    const passwordHash = await hashPassword(input.newPassword);

    const otherSessionsEnded = await this.transactions.run(async (tx) => {
      await this.userDao.updateUser(user.id, { passwordHash }, tx);
      const ended = await this.authService.revokeOtherSessions(user, tx);
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'PASSWORD_CHANGED',
          entityType: 'user',
          entityId: user.id,
          details: { otherSessionsEnded: ended },
        },
        tx,
      );
      return ended;
    });

    await this.email.send(user.email, 'PASSWORD_CHANGED', {
      resetUrl: this.email.appUrl('/forgot-password'),
    });
    return { changed: true, otherSessionsEnded };
  }

  /** Changes the display name. The audit entry records that it changed, not the names. */
  async updateName(user: AuthUser, input: UpdateAccountInput): Promise<MeView> {
    await this.transactions.run(async (tx) => {
      await this.userDao.updateUser(user.id, { fullName: input.fullName }, tx);
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'ACCOUNT_NAME_CHANGED',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      );
    });
    return this.authService.describe({ ...user, fullName: input.fullName });
  }
}
