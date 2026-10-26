import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const credentialsSelect = {
  id: true,
  email: true,
  status: true,
  passwordHash: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

/** Includes passwordHash. Only AuthService may see this shape, and it must never be returned. */
export type UserCredentials = Prisma.UserGetPayload<{ select: typeof credentialsSelect }>;

@Injectable()
export class UserDao {
  constructor(private readonly prisma: PrismaService) {}

  /** Email is citext, so this lookup is case-insensitive. */
  getUserCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { email }, select: credentialsSelect });
  }

  async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).user.update({ where: { id }, data, select: { id: true } });
  }
}
