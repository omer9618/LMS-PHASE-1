import { Inject, Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { TransactionService } from '../../../prisma/transaction.service';
import { SessionDao } from '../dao/session.dao';
import { UserDao } from '../dao/user.dao';
import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedSessionToken,
} from '../domain/session-token';
import {
  DEFAULT_TOUCH_INTERVAL_MS,
  rejectSession,
  SessionPolicy,
  sessionExpiry,
  shouldTouch,
} from '../domain/session.rules';
import type { LoginInput } from '../schemas/auth.schema';

/** What the API returns about a user. Never includes passwordHash. */
export interface UserView {
  id: string;
  email: string;
  roles: Role[];
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
  /** The session cookie already on the request, if any. Revoked on login (rotation). */
  currentToken?: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: UserView;
}

const MAX_USER_AGENT_LENGTH = 512;

@Injectable()
export class AuthService {
  private readonly policy: SessionPolicy;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly userDao: UserDao,
    private readonly sessionDao: SessionDao,
    private readonly transactions: TransactionService,
    @Inject(ENV) env: Env,
  ) {
    this.policy = {
      ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
      idleTimeoutMs: env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000,
      touchIntervalMs: DEFAULT_TOUCH_INTERVAL_MS,
    };
  }

  async login(input: LoginInput, client: ClientContext): Promise<LoginResult> {
    const user = await this.userDao.getUserCredentialsByEmail(input.email);

    // Always run bcrypt, even for unknown emails, so response time does not reveal which exist.
    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS);
    }

    const now = new Date();
    const token = generateSessionToken();
    const expiresAt = sessionExpiry(now, this.policy);

    await this.transactions.run(async (tx) => {
      if (isWellFormedSessionToken(client.currentToken)) {
        await this.sessionDao.revokeSessionsBy(
          { tokenHash: hashSessionToken(client.currentToken) },
          now,
          tx,
        );
      }
      await this.sessionDao.createSession(
        {
          userId: user.id,
          tokenHash: hashSessionToken(token),
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
        },
        tx,
      );
      await this.userDao.updateUser(user.id, { lastLoginAt: now }, tx);
    });

    return {
      token,
      expiresAt,
      user: { id: user.id, email: user.email, roles: user.roles.map((r) => r.role) },
    };
  }

  /** Revokes the session server-side. Safe to call with a missing or already-dead token. */
  async logout(token: string | undefined): Promise<void> {
    if (!isWellFormedSessionToken(token)) return;
    await this.sessionDao.revokeSessionsBy({ tokenHash: hashSessionToken(token) }, new Date());
  }

  /** Resolves a session cookie to the caller, or null if it is missing, dead or revoked. */
  async authenticate(token: string | undefined): Promise<AuthUser | null> {
    if (!isWellFormedSessionToken(token)) return null;

    const session = await this.sessionDao.getSessionWithUserBy({
      tokenHash: hashSessionToken(token),
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
      roles: new Set(session.user.roles.map((r) => r.role)),
      sessionId: session.id,
    };
  }

  describe(user: AuthUser): UserView {
    return { id: user.id, email: user.email, roles: [...user.roles] };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash('timing-equaliser-not-a-password', 10);
    return this.dummyHash;
  }
}
