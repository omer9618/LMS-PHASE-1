import { Inject, Injectable } from '@nestjs/common';
import { AuthTokenPurpose, Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuthTokenDao } from '../dao/auth-token.dao';
import { SessionDao } from '../dao/session.dao';
import { UserDao, UserRecord } from '../dao/user.dao';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  isWellFormedOpaqueToken,
} from '../domain/opaque-token';
import {
  DEFAULT_TOUCH_INTERVAL_MS,
  rejectSession,
  SessionPolicy,
  sessionExpiry,
  shouldTouch,
} from '../domain/session.rules';
import type { LoginInput } from '../schemas/auth.schema';
import { hashPassword, verifyPassword } from './passwords';

/** What the API returns about a user. Never includes passwordHash. */
export interface UserView {
  id: string;
  email: string;
  fullName: string | null;
  isEmailVerified: boolean;
  roles: Role[];
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  /** The session cookie already on the request, if any. Revoked when a new session starts. */
  currentToken?: string;
}

export interface SessionGrant {
  token: string;
  expiresAt: Date;
  user: UserView;
}

/** A correct password either starts a session, or (MFA accounts) asks for a second factor. */
export type LoginOutcome =
  | { kind: 'session'; grant: SessionGrant }
  | { kind: 'mfa'; challengeToken: string; expiresAt: Date };

/** How long the user has to enter their TOTP code after a correct password. */
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const MAX_USER_AGENT_LENGTH = 512;

/** Login, logout and session resolution (#12). Account lifecycle lives in AccountService. */
@Injectable()
export class AuthService {
  private readonly policy: SessionPolicy;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly userDao: UserDao,
    private readonly sessionDao: SessionDao,
    private readonly authTokenDao: AuthTokenDao,
    private readonly transactions: TransactionService,
    @Inject(ENV) env: Env,
  ) {
    this.policy = {
      ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
      idleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
      touchIntervalMs: DEFAULT_TOUCH_INTERVAL_MS,
    };
  }

  async login(input: LoginInput, client: ClientContext): Promise<LoginOutcome> {
    const user = await this.userDao.getUserCredentialsByEmail(input.email);

    // Always run bcrypt, even for unknown emails, so response time does not reveal which exist.
    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS);
    }

    if (user.mfaEnabledAt) {
      // The password alone proves nothing more: issue a short single-use challenge instead.
      const challengeToken = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MS);
      await this.authTokenDao.createAuthToken({
        userId: user.id,
        purpose: AuthTokenPurpose.MFA_CHALLENGE,
        tokenHash: hashOpaqueToken(challengeToken),
        expiresAt,
      });
      return { kind: 'mfa', challengeToken, expiresAt };
    }

    const grant = await this.transactions.run((tx) => this.startSession(user, client, tx));
    return { kind: 'session', grant };
  }

  /**
   * Creates a session for an already-authenticated user (login, registration), rotating out the
   * caller's current session if any. Run inside the caller's transaction.
   */
  async startSession(
    user: UserRecord,
    client: ClientContext,
    tx: TransactionClient,
    options: { mfaVerified?: boolean } = {},
  ): Promise<SessionGrant> {
    const now = new Date();
    const token = generateOpaqueToken();
    const expiresAt = sessionExpiry(now, this.policy);

    if (isWellFormedOpaqueToken(client.currentToken)) {
      await this.sessionDao.revokeSessionsBy(
        { tokenHash: hashOpaqueToken(client.currentToken) },
        now,
        tx,
      );
    }
    await this.sessionDao.createSession(
      {
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
        mfaVerifiedAt: options.mfaVerified ? now : null,
      },
      tx,
    );
    await this.userDao.updateUser(user.id, { lastLoginAt: now }, tx);

    return { token, expiresAt, user: toUserView(user) };
  }

  /** Revokes the session server-side. Safe to call with a missing or already-dead token. */
  async logout(token: string | undefined): Promise<void> {
    if (!isWellFormedOpaqueToken(token)) return;
    await this.sessionDao.revokeSessionsBy({ tokenHash: hashOpaqueToken(token) }, new Date());
  }

  /** Signs a user out everywhere (password reset #13, suspension #15). */
  async revokeAllSessions(userId: string, tx?: TransactionClient): Promise<void> {
    await this.sessionDao.revokeSessionsBy({ userId }, new Date(), tx);
  }

  /** Resolves a session cookie to the caller, or null if it is missing, dead or revoked. */
  async authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (!isWellFormedOpaqueToken(token)) return null;

    const session = await this.sessionDao.getSessionWithUserBy({
      tokenHash: hashOpaqueToken(token),
    });
    if (!session) return null;

    const now = new Date();
    const rejection = rejectSession(
      { ...session, userStatus: session.user.status },
      now,
      this.policy,
    );
    if (rejection) return null;

    if (shouldTouch(session.lastSeenAt, now, this.policy)) {
      await this.sessionDao.updateSession(session.id, { lastSeenAt: now });
    }

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      isEmailVerified: session.user.isEmailVerified,
      roles: new Set(session.user.roles.map((r) => r.role)),
      sessionId: session.id,
      mfaEnabled: session.user.mfaEnabledAt !== null,
      mfaVerified: session.mfaVerifiedAt !== null,
    };
  }

  describe(user: AuthUser): UserView & { mfaEnabled: boolean; mfaVerified: boolean } {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isEmailVerified: user.isEmailVerified,
      roles: [...user.roles],
      mfaEnabled: user.mfaEnabled,
      mfaVerified: user.mfaVerified,
    };
  }

  /** Marks the current session MFA-verified (right after enrolment proves the authenticator). */
  async markSessionMfaVerified(sessionId: string, tx?: TransactionClient): Promise<void> {
    await this.sessionDao.updateSession(sessionId, { mfaVerifiedAt: new Date() }, tx);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('timing-equaliser-not-a-password');
    return this.dummyHash;
  }
}

export function toUserView(user: UserRecord): UserView {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isEmailVerified: user.isEmailVerified,
    roles: user.roles.map((r) => r.role),
  };
}
