import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  isEmailVerified: true,
  mfaEnabledAt: true,
  status: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

const mfaStateSelect = {
  id: true,
  email: true,
  mfaSecretEncrypted: true,
  mfaEnabledAt: true,
  mfaLastUsedStep: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

/** Includes the encrypted TOTP secret. Only MfaService may see this shape. */
export type UserMfaState = Prisma.UserGetPayload<{ select: typeof mfaStateSelect }>;

const credentialsSelect = { ...userSelect, passwordHash: true } satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Includes passwordHash. Only auth services may see this shape, and it must never be returned. */
export type UserCredentials = Prisma.UserGetPayload<{ select: typeof credentialsSelect }>;

/** What admins see about an account (#15, #103). Never the hash or MFA secret. */
const adminUserSelect = {
  ...userSelect,
  guardianName: true,
  guardianEmail: true,
  guardianPhone: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

@Injectable()
export class UserDao {
  constructor(private readonly prisma: PrismaService) {}

  /** Email is citext, so this lookup is case-insensitive. */
  getUserCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { email }, select: credentialsSelect });
  }

  getUserMfaState(id: string, tx?: TransactionClient): Promise<UserMfaState | null> {
    return (tx ?? this.prisma).user.findUnique({ where: { id }, select: mfaStateSelect });
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

  /**
   * Records a used TOTP step only if it is newer than the last one, so the same code cannot be
   * accepted twice even by concurrent requests.
   */
  async advanceMfaStep(userId: string, step: number, tx?: TransactionClient): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).user.updateMany({
      where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step },
    });
    return count === 1;
  }

  getAdminUserBy(where: Prisma.UserWhereUniqueInput): Promise<AdminUserRecord | null> {
    return this.prisma.user.findUnique({ where, select: adminUserSelect });
  }

  getAdminUsersBy(
    where: Prisma.UserWhereInput,
    page: { limit: number; offset: number },
  ): Promise<AdminUserRecord[]> {
    return this.prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countUsersBy(where: Prisma.UserWhereInput, tx?: TransactionClient): Promise<number> {
    return (tx ?? this.prisma).user.count({ where });
  }

  async addRole(userId: string, role: Role, tx?: TransactionClient): Promise<void> {
    await (tx ?? this.prisma).userRole.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role },
      select: { id: true },
    });
  }

  async removeRole(userId: string, role: Role, tx?: TransactionClient): Promise<void> {
    await (tx ?? this.prisma).userRole.deleteMany({ where: { userId, role } });
  }

  async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    tx?: TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).user.update({ where: { id }, data, select: { id: true } });
  }
}
