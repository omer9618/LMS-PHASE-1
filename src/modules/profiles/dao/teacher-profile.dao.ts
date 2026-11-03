import { Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import type { TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const profileSelect = {
  userId: true,
  bio: true,
  photoUrl: true,
  qualifications: true,
  socialLinks: true,
  f2fLocations: true,
  isPublished: true,
  user: { select: { id: true, fullName: true, status: true } },
} satisfies Prisma.TeacherProfileSelect;

export type TeacherProfileRecord = Prisma.TeacherProfileGetPayload<{
  select: typeof profileSelect;
}>;

export type TeacherProfileData = Omit<Prisma.TeacherProfileUncheckedCreateInput, 'userId'>;

/**
 * Where a profile is public (#99): published, and its owner is an ACTIVE teacher. Matches the
 * catalogue's rule that a suspended teacher's courses disappear from public view.
 */
export const PUBLIC_PROFILE_WHERE: Prisma.TeacherProfileWhereInput = {
  isPublished: true,
  user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.TEACHER } } },
};

/**
 * A profile is teacher-owned (#14): every method except the public read takes a TeacherScope.
 * A teacher scope only ever reaches the teacher's own row (the key is `user_id`).
 */
@Injectable()
export class TeacherProfileDao {
  constructor(private readonly prisma: PrismaService) {}

  getProfile(
    scope: TeacherScope,
    teacherId: string,
    tx?: TransactionClient,
  ): Promise<TeacherProfileRecord | null> {
    return (tx ?? this.prisma).teacherProfile.findFirst({
      where: { AND: [{ userId: teacherId }, ownerWhere(scope)] },
      select: profileSelect,
    });
  }

  /** Creates the profile on first save (#98). */
  upsertProfile(
    scope: TeacherScope,
    teacherId: string,
    data: TeacherProfileData,
    tx?: TransactionClient,
  ): Promise<TeacherProfileRecord> {
    const userId = scopedOwner(scope, teacherId);
    return (tx ?? this.prisma).teacherProfile.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data,
      select: profileSelect,
    });
  }

  /**
   * Changes visibility only if it is still `expected`, so two concurrent publish/unpublish
   * requests cannot both succeed. Null if it changed meanwhile.
   */
  async setPublished(
    scope: TeacherScope,
    teacherId: string,
    expected: boolean,
    isPublished: boolean,
    tx?: TransactionClient,
  ): Promise<TeacherProfileRecord | null> {
    const client = tx ?? this.prisma;
    const userId = scopedOwner(scope, teacherId);
    const { count } = await client.teacherProfile.updateMany({
      where: { userId, isPublished: expected },
      data: { isPublished },
    });
    if (count === 0) return null;
    return client.teacherProfile.findUnique({ where: { userId }, select: profileSelect });
  }

  /** Public read (#99), like the catalogue: no scope, but only PUBLIC_PROFILE_WHERE matches. */
  getPublicProfile(teacherId: string): Promise<TeacherProfileRecord | null> {
    return this.prisma.teacherProfile.findFirst({
      where: { AND: [PUBLIC_PROFILE_WHERE, { userId: teacherId }] },
      select: profileSelect,
    });
  }
}

function ownerWhere(scope: TeacherScope): Prisma.TeacherProfileWhereInput {
  return 'teacherId' in scope ? { userId: scope.teacherId } : {};
}

/** The row a write may touch: a teacher scope can only ever write its own profile. */
function scopedOwner(scope: TeacherScope, teacherId: string): string {
  if ('teacherId' in scope && scope.teacherId !== teacherId) {
    throw new Error('A teacher scope can only write its own profile');
  }
  return teacherId;
}
