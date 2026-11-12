import { Inject, Injectable } from '@nestjs/common';
import { AuthTokenPurpose, Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { EmailService } from '../../email/services/email.service';
import { AuthTokenDao, AuthTokenRecord } from '../dao/auth-token.dao';
import { MfaRecoveryCodeDao } from '../dao/mfa-recovery-code.dao';
import { UserDao, UserMfaState } from '../dao/user.dao';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  parseMfaKey,
} from '../domain/mfa-crypto';
import { hashOpaqueToken, isWellFormedOpaqueToken } from '../domain/opaque-token';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../domain/totp';
import type { MfaCodeInput, MfaLoginInput } from '../schemas/mfa.schema';
import { AuthService, ClientContext, SessionGrant } from './auth.service';

/** Wrong guesses a sign-in challenge survives; it is single-use and dies after this many tries. */
export const MAX_CHALLENGE_ATTEMPTS = 5;
/** Wrong codes in the window below that pause two-step sign-in for the whole account. */
export const ACCOUNT_LOCK_FAILURES = 10;
export const ACCOUNT_LOCK_MINUTES = 15;

export interface MfaStatus {
  enabled: boolean;
  /** Admin accounts must use MFA (#16). */
  required: boolean;
  recoveryCodesRemaining: number;
}

/**
 * TOTP multi-factor authentication (#16): enrolment, login challenge and recovery codes.
 * Enforcement (admin routes need an MFA-verified session) lives in AuthGuard.
 */
@Injectable()
export class MfaService {
  private readonly key: Buffer;
  private readonly issuer: string;

  constructor(
    private readonly userDao: UserDao,
    private readonly recoveryCodeDao: MfaRecoveryCodeDao,
    private readonly authTokenDao: AuthTokenDao,
    private readonly authService: AuthService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    @Inject(ENV) env: Env,
  ) {
    this.key = parseMfaKey(env.MFA_ENCRYPTION_KEY);
    this.issuer = env.MFA_ISSUER;
  }

  async status(user: AuthUser): Promise<MfaStatus> {
    return {
      enabled: user.mfaEnabled,
      required: user.heldRoles.has(Role.ADMIN),
      recoveryCodesRemaining: user.mfaEnabled
        ? await this.recoveryCodeDao.countUnusedRecoveryCodes(user.id)
        : 0,
    };
  }

  /** Step 1 of enrolment: a new secret to add to the authenticator app. Not active yet. */
  async setup(user: AuthUser): Promise<{ secret: string; otpauthUri: string }> {
    if (user.mfaEnabled) throw alreadyEnabled();
    const secret = generateTotpSecret();
    await this.userDao.updateUser(user.id, {
      mfaSecretEncrypted: encryptSecret(secret, this.key),
      mfaLastUsedStep: null,
    });
    return { secret, otpauthUri: otpauthUri(this.issuer, user.email, secret) };
  }

  /**
   * Step 2: a code from the app proves it was set up correctly. MFA turns on, the current
   * session counts as verified, and one-time recovery codes are returned (shown once).
   */
  async enable(user: AuthUser, input: MfaCodeInput): Promise<{ recoveryCodes: string[] }> {
    const recoveryCodes = generateRecoveryCodes();
    await this.transactions.run(async (tx) => {
      const state = await this.loadState(user.id, tx);
      if (state.mfaEnabledAt) throw alreadyEnabled();
      if (!state.mfaSecretEncrypted) {
        throw new AppException(ErrorCode.CONFLICT, undefined, undefined, {
          message: 'Start MFA setup first',
        });
      }
      await this.assertTotp(state, input.code, tx);
      await this.userDao.updateUser(user.id, { mfaEnabledAt: new Date() }, tx);
      await this.recoveryCodeDao.replaceRecoveryCodes(
        user.id,
        recoveryCodes.map((code) => hashRecoveryCode(code, this.key)),
        tx,
      );
      await this.authService.markSessionMfaVerified(user.sessionId, tx);
      await this.audit.record(
        { actorUserId: user.id, action: 'MFA_ENABLED', entityType: 'user', entityId: user.id },
        tx,
      );
    });
    return { recoveryCodes };
  }

  /** Accounts holding ADMIN cannot turn MFA off: it is enforced for them. */
  async disable(user: AuthUser, input: MfaCodeInput): Promise<{ enabled: false }> {
    if (user.heldRoles.has(Role.ADMIN)) {
      throw new AppException(ErrorCode.CONFLICT, undefined, undefined, {
        message: 'Two-factor authentication is required for admin accounts',
      });
    }
    await this.transactions.run(async (tx) => {
      const state = await this.loadEnabledState(user.id, tx);
      await this.assertTotp(state, input.code, tx);
      await this.userDao.updateUser(
        user.id,
        { mfaEnabledAt: null, mfaSecretEncrypted: null, mfaLastUsedStep: null },
        tx,
      );
      await this.recoveryCodeDao.deleteRecoveryCodes(user.id, tx);
      await this.audit.record(
        { actorUserId: user.id, action: 'MFA_DISABLED', entityType: 'user', entityId: user.id },
        tx,
      );
    });
    return { enabled: false };
  }

  async regenerateRecoveryCodes(
    user: AuthUser,
    input: MfaCodeInput,
  ): Promise<{ recoveryCodes: string[] }> {
    const recoveryCodes = generateRecoveryCodes();
    await this.transactions.run(async (tx) => {
      const state = await this.loadEnabledState(user.id, tx);
      await this.assertTotp(state, input.code, tx);
      await this.recoveryCodeDao.replaceRecoveryCodes(
        user.id,
        recoveryCodes.map((code) => hashRecoveryCode(code, this.key)),
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'MFA_RECOVERY_CODES_REGENERATED',
          entityType: 'user',
          entityId: user.id,
        },
        tx,
      );
    });
    return { recoveryCodes };
  }

  /** Login step 2: the challenge from step 1 plus a TOTP or recovery code starts the session. */
  async completeLogin(input: MfaLoginInput, client: ClientContext): Promise<SessionGrant> {
    if (!isWellFormedOpaqueToken(input.challengeToken)) throw invalidCode();
    const challenge = await this.authTokenDao.getAuthTokenBy(
      hashOpaqueToken(input.challengeToken),
      AuthTokenPurpose.MFA_CHALLENGE,
    );
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.user.status !== UserStatus.ACTIVE
    ) {
      throw new AppException(ErrorCode.INVALID_TOKEN, undefined, undefined, {
        message: 'This sign-in attempt has expired. Sign in again.',
      });
    }

    // Account-wide brake: many wrong codes across challenges pause two-step sign-in for a while.
    const windowStart = new Date(Date.now() - ACCOUNT_LOCK_MINUTES * 60_000);
    const recentFailures = await this.audit.countSince(
      'MFA_LOGIN_FAILED',
      challenge.userId,
      windowStart,
    );
    if (recentFailures >= ACCOUNT_LOCK_FAILURES) {
      throw new AppException(ErrorCode.RATE_LIMITED, undefined, undefined, {
        message: `Too many incorrect codes. Two-step sign-in is paused for ${ACCOUNT_LOCK_MINUTES} minutes.`,
      });
    }
    // Per-challenge brake: spend a guess before checking, so parallel requests cannot out-guess it.
    if (!(await this.authTokenDao.reserveAttempt(challenge.id, MAX_CHALLENGE_ATTEMPTS))) {
      throw new AppException(ErrorCode.INVALID_TOKEN, undefined, undefined, {
        message: 'This sign-in attempt has expired. Sign in again.',
      });
    }

    try {
      return await this.verifyAndStartSession(challenge, input, client);
    } catch (error) {
      if (error instanceof AppException && error.code === ErrorCode.INVALID_MFA_CODE) {
        await this.recordFailure(challenge.userId, challenge.user.email, input, recentFailures + 1);
      }
      throw error;
    }
  }

  private async verifyAndStartSession(
    challenge: AuthTokenRecord,
    input: MfaLoginInput,
    client: ClientContext,
  ): Promise<SessionGrant> {
    return this.transactions.run(async (tx) => {
      const state = await this.loadEnabledState(challenge.userId, tx);
      if (input.recoveryCode) {
        const used = await this.recoveryCodeDao.consumeRecoveryCode(
          state.id,
          hashRecoveryCode(input.recoveryCode, this.key),
          new Date(),
          tx,
        );
        if (!used) throw invalidCode();
        await this.audit.record(
          {
            actorUserId: state.id,
            action: 'MFA_RECOVERY_CODE_USED',
            entityType: 'user',
            entityId: state.id,
          },
          tx,
        );
      } else {
        await this.assertTotp(state, input.code as string, tx);
      }

      if (!(await this.authTokenDao.consumeAuthToken(challenge.id, new Date(), tx))) {
        throw invalidCode();
      }
      const user = await this.userDao.getUserBy({ id: state.id });
      if (!user) throw new AppException(ErrorCode.NOT_FOUND);
      return this.authService.startSession(user, client, tx, { mfaVerified: true });
    });
  }

  /** A wrong second factor is audited (outside the rolled-back transaction); the 10th locks. */
  private async recordFailure(
    userId: string,
    email: string,
    input: MfaLoginInput,
    failuresInWindow: number,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: userId,
      action: 'MFA_LOGIN_FAILED',
      entityType: 'user',
      entityId: userId,
      details: { method: input.recoveryCode ? 'recovery_code' : 'totp', failuresInWindow },
    });
    if (failuresInWindow === ACCOUNT_LOCK_FAILURES) {
      await this.audit.record({
        actorUserId: userId,
        action: 'MFA_LOCKED',
        entityType: 'user',
        entityId: userId,
        details: { minutes: ACCOUNT_LOCK_MINUTES },
      });
      await this.email.send(email, 'MFA_LOCKED', {
        minutes: ACCOUNT_LOCK_MINUTES,
        resetUrl: this.email.appUrl('/forgot-password'),
      });
    }
  }

  /** Verifies a TOTP code and records its step so it can never be used again. */
  private async assertTotp(state: UserMfaState, code: string, tx: TransactionClient) {
    const secret = decryptSecret(state.mfaSecretEncrypted as string, this.key);
    const step = verifyTotp(secret, code, new Date(), state.mfaLastUsedStep);
    if (step === null || !(await this.userDao.advanceMfaStep(state.id, step, tx))) {
      throw invalidCode();
    }
  }

  private async loadState(userId: string, tx: TransactionClient): Promise<UserMfaState> {
    const state = await this.userDao.getUserMfaState(userId, tx);
    if (!state) throw new AppException(ErrorCode.NOT_FOUND);
    return state;
  }

  private async loadEnabledState(userId: string, tx: TransactionClient): Promise<UserMfaState> {
    const state = await this.loadState(userId, tx);
    if (!state.mfaEnabledAt || !state.mfaSecretEncrypted) {
      throw new AppException(ErrorCode.CONFLICT, undefined, undefined, {
        message: 'Two-factor authentication is not enabled',
      });
    }
    return state;
  }
}

function alreadyEnabled(): AppException {
  return new AppException(ErrorCode.CONFLICT, undefined, undefined, {
    message: 'Two-factor authentication is already enabled',
  });
}

function invalidCode(): AppException {
  return new AppException(ErrorCode.INVALID_MFA_CODE);
}
