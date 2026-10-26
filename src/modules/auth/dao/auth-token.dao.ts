import { Injectable } from '@nestjs/common';
import { AuthTokenPurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const authTokenSelect = {
  id: true,
  userId: true,
  purpose: true,
  expiresAt: true,
  usedAt: true,
  user: { select: { id: true, email: true, status: true } },
} satisfies Prisma.AuthTokenSelect;

export type AuthTokenRecord = Prisma.AuthTokenGetPayload<{ select: typeof authTokenSelect }>;

@Injectable()
export class AuthTokenDao {
  constructor(private readonly prisma: PrismaService) {}

  async createAuthToken(
    data: Prisma.AuthTokenUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).authToken.create({ data, select: { id: true } });
  }

  getAuthTokenBy(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthTokenRecord | null> {
    return this.prisma.authToken.findFirst({
      where: { tokenHash, purpose },
      select: authTokenSelect,
    });
  }

  /**
   * Marks a token used only if it is still unused. Returns false if it was already consumed,
   * so two concurrent requests with the same token cannot both succeed.
   */
  async consumeAuthToken(id: string, usedAt: Date, tx?: TransactionClient): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).authToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt },
    });
    return count === 1;
  }

  /** Retires every unused token of a purpose for a user (e.g. when a new one is issued). */
  async retireAuthTokensBy(
    userId: string,
    purpose: AuthTokenPurpose,
    usedAt: Date,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt },
    });
  }
}
