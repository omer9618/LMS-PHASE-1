import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  isEmailVerified: true,
  status: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

const credentialsSelect = { ...userSelect, passwordHash: true } satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Includes passwordHash. Only auth services may see this shape, and it must never be returned. */
export type UserCredentials = Prisma.UserGetPayload<{ select: typeof credentialsSelect }>;

@Injectable()
export class UserDao {
  constructor(private readonly prisma: PrismaService) {}

  /** Email is citext, so this lookup is case-insensitive. */
  getUserCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { email }, select: credentialsSelect });
  }

  getUserBy(where: Prisma.UserWhereUniqueInput): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where, select: userSelect });
  }

  createUser(
    data: Omit<Prisma.UserCreateInput, 'roles'>,
    roles: Role[],
    tx?: TransactionClient,
  ): Promise<UserRecord> {
    return (tx ?? this.prisma).user.create({
      data: { ...data, roles: { create: roles.map((role) => ({ role })) } },
      select: userSelect,
    });
  }

  async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).user.update({ where: { id }, data, select: { id: true } });
  }
}
