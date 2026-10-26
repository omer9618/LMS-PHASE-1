import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const sessionWithUserSelect = {
  id: true,
  expiresAt: true,
  lastSeenAt: true,
  revokedAt: true,
  user: {
    select: { id: true, email: true, status: true, roles: { select: { role: true } } },
  },
} satisfies Prisma.SessionSelect;

export type SessionWithUser = Prisma.SessionGetPayload<{ select: typeof sessionWithUserSelect }>;

@Injectable()
export class SessionDao {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    data: Prisma.SessionUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<{ id: string }> {
    return (tx ?? this.prisma).session.create({ data, select: { id: true } });
  }

  /** One query: session, its user and the user's roles. */
  getSessionWithUserBy(where: Prisma.SessionWhereUniqueInput): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({ where, select: sessionWithUserSelect });
  }

  async updateSession(
    id: string,
    data: Prisma.SessionUpdateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).session.update({ where: { id }, data, select: { id: true } });
  }

  /** Revokes every live session matching `where`. Used by logout and, later, password reset (#13). */
  async revokeSessionsBy(
    where: Prisma.SessionWhereInput,
    revokedAt: Date,
    tx?: TransactionClient,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma).session.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt },
    });
    return count;
  }

  /** For the future cleanup job (@nestjs/schedule): physically remove long-dead rows. */
  async deleteSessionsBy(where: Prisma.SessionWhereInput, tx?: TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma).session.deleteMany({ where });
    return count;
  }
}
