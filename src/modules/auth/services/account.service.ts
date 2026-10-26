import { Injectable } from '@nestjs/common';
import { AuthTokenPurpose, Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { EmailService } from '../../email/services/email.service';
import { AuthTokenDao } from '../dao/auth-token.dao';
import { UserDao } from '../dao/user.dao';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  isWellFormedOpaqueToken,
} from '../domain/opaque-token';
import { assertAcceptablePassword, TOKEN_TTL } from '../domain/password.rules';
import type {
  ConfirmPasswordResetInput,
  RegisterInput,
  RequestPasswordResetInput,
  VerifyEmailInput,
} from '../schemas/auth.schema';
import { AuthService, ClientContext, SessionGrant } from './auth.service';
import { hashPassword } from './passwords';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Account lifecycle: student registration and email verification (#11), password reset (#13). */
@Injectable()
export class AccountService {
  constructor(
    private readonly userDao: UserDao,
    private readonly authTokenDao: AuthTokenDao,
    private readonly authService: AuthService,
    private readonly transactions: TransactionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * #11: creates a STUDENT account (guardian details optional), signs them in and emails a
   * verification link. Verification is required later, before paid enrollment.
   */
  async register(input: RegisterInput, client: ClientContext): Promise<SessionGrant> {
    assertAcceptablePassword(input.password, input.email);
    const existing = await this.userDao.getUserBy({ email: input.email });
    if (existing) {
      throw new AppException(ErrorCode.CONFLICT, { field: 'email' }, undefined, {
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await hashPassword(input.password);
    const verificationToken = generateOpaqueToken();

    // The unique email constraint is the backstop if two registrations race.
    const grant = await this.transactions.run(async (tx) => {
      const user = await this.userDao.createUser(
        {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          guardianName: input.guardianName ?? null,
          guardianEmail: input.guardianEmail ?? null,
          guardianPhone: input.guardianPhone ?? null,
          status: UserStatus.ACTIVE,
        },
        [Role.STUDENT],
        tx,
      );
      await this.issueVerificationToken(user.id, verificationToken, tx);
      return this.authService.startSession(user, client, tx);
    });

    await this.sendVerificationEmail(grant.user.email, verificationToken);
    return grant;
  }

  /** #11: confirms the email address from the emailed link. Single use. */
  async verifyEmail(input: VerifyEmailInput): Promise<{ verified: true }> {
    const token = await this.loadUsableToken(input.token, AuthTokenPurpose.EMAIL_VERIFICATION);
    await this.transactions.run(async (tx) => {
      if (!(await this.authTokenDao.consumeAuthToken(token.id, new Date(), tx))) {
        throw invalidToken();
      }
      await this.userDao.updateUser(token.userId, { isEmailVerified: true }, tx);
    });
    return { verified: true };
  }

  /** Sends a fresh verification link; earlier unused links stop working. */
  async resendVerification(user: AuthUser): Promise<{ sent: boolean }> {
    if (user.isEmailVerified) return { sent: false };
    const token = generateOpaqueToken();
    await this.transactions.run((tx) => this.issueVerificationToken(user.id, token, tx));
    await this.sendVerificationEmail(user.email, token);
    return { sent: true };
  }

  /**
   * #13: always answers the same way, so it cannot be used to discover accounts. Only active
   * accounts receive an email.
   */
  async requestPasswordReset(input: RequestPasswordResetInput): Promise<{ requested: true }> {
    const user = await this.userDao.getUserBy({ email: input.email });
    if (!user || user.status !== UserStatus.ACTIVE) return { requested: true };

    const token = await this.transactions.run((tx) =>
      this.issuePasswordSetToken(user.id, TOKEN_TTL.PASSWORD_RESET_MINUTES * MINUTE_MS, tx),
    );

    await this.email.send(user.email, 'PASSWORD_RESET', {
      resetUrl: this.email.appUrl('/reset-password', { token }),
      expiresInMinutes: TOKEN_TTL.PASSWORD_RESET_MINUTES,
    });
    return { requested: true };
  }

  /**
   * #13: single-use, time-limited token sets a new password and signs the user out everywhere.
   * A successful reset also proves control of the inbox, so the email counts as verified.
   */
  async confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<{ reset: true }> {
    const token = await this.loadUsableToken(input.token, AuthTokenPurpose.PASSWORD_RESET);
    assertAcceptablePassword(input.password, token.user.email);
    const passwordHash = await hashPassword(input.password);
    const now = new Date();

    await this.transactions.run(async (tx) => {
      if (!(await this.authTokenDao.consumeAuthToken(token.id, now, tx))) throw invalidToken();
      await this.authTokenDao.retireAuthTokensBy(
        token.userId,
        AuthTokenPurpose.PASSWORD_RESET,
        now,
        tx,
      );
      await this.userDao.updateUser(token.userId, { passwordHash, isEmailVerified: true }, tx);
      await this.authService.revokeAllSessions(token.userId, tx);
      await this.audit.record(
        {
          actorUserId: token.userId,
          action: 'PASSWORD_RESET',
          entityType: 'user',
          entityId: token.userId,
        },
        tx,
      );
    });
    return { reset: true };
  }

  /**
   * A single-use link to set a password (password reset, and new accounts created by an admin).
   * Retires any earlier unused link. Returns the raw token to put in the email.
   */
  async issuePasswordSetToken(
    userId: string,
    ttlMs: number,
    tx: TransactionClient,
  ): Promise<string> {
    const token = generateOpaqueToken();
    const now = new Date();
    await this.authTokenDao.retireAuthTokensBy(userId, AuthTokenPurpose.PASSWORD_RESET, now, tx);
    await this.authTokenDao.createAuthToken(
      {
        userId,
        purpose: AuthTokenPurpose.PASSWORD_RESET,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + ttlMs),
      },
      tx,
    );
    return token;
  }

  private async issueVerificationToken(
    userId: string,
    token: string,
    tx: TransactionClient,
  ): Promise<void> {
    const now = new Date();
    await this.authTokenDao.retireAuthTokensBy(
      userId,
      AuthTokenPurpose.EMAIL_VERIFICATION,
      now,
      tx,
    );
    await this.authTokenDao.createAuthToken(
      {
        userId,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL.EMAIL_VERIFICATION_HOURS * HOUR_MS),
      },
      tx,
    );
  }

  private sendVerificationEmail(to: string, token: string): Promise<boolean> {
    return this.email.send(to, 'EMAIL_VERIFICATION', {
      verifyUrl: this.email.appUrl('/verify-email', { token }),
      expiresInHours: TOKEN_TTL.EMAIL_VERIFICATION_HOURS,
    });
  }

  /** Unknown, used, expired and inactive-account tokens all fail the same way. */
  private async loadUsableToken(rawToken: string, purpose: AuthTokenPurpose) {
    if (!isWellFormedOpaqueToken(rawToken)) throw invalidToken();
    const token = await this.authTokenDao.getAuthTokenBy(hashOpaqueToken(rawToken), purpose);
    if (
      !token ||
      token.usedAt ||
      token.expiresAt.getTime() <= Date.now() ||
      token.user.status !== UserStatus.ACTIVE
    ) {
      throw invalidToken();
    }
    return token;
  }
}

function invalidToken(): AppException {
  return new AppException(ErrorCode.INVALID_TOKEN);
}
