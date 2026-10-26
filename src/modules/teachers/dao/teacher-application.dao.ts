import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const applicationSelect = {
  id: true,
  applicantName: true,
  applicantEmail: true,
  applicantPhone: true,
  subjects: true,
  cvUrl: true,
  status: true,
  reviewedAt: true,
  reviewNotes: true,
  purgeAfter: true,
  createdAt: true,
  reviewedBy: { select: { id: true, email: true, fullName: true } },
  user: { select: { id: true, email: true, fullName: true, status: true } },
} satisfies Prisma.TeacherApplicationSelect;

export type ApplicationRecord = Prisma.TeacherApplicationGetPayload<{
  select: typeof applicationSelect;
}>;

@Injectable()
export class TeacherApplicationDao {
  constructor(private readonly prisma: PrismaService) {}

  createApplication(
    data: Prisma.TeacherApplicationUncheckedCreateInput,
    tx?: TransactionClient,
  ): Promise<ApplicationRecord> {
    return (tx ?? this.prisma).teacherApplication.create({ data, select: applicationSelect });
  }

  getApplicationBy(
    where: Prisma.TeacherApplicationWhereUniqueInput,
  ): Promise<ApplicationRecord | null> {
    return this.prisma.teacherApplication.findUnique({ where, select: applicationSelect });
  }

  getApplicationsBy(
    where: Prisma.TeacherApplicationWhereInput,
    page: { limit: number; offset: number },
  ): Promise<ApplicationRecord[]> {
    return this.prisma.teacherApplication.findMany({
      where,
      select: applicationSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: page.limit,
      skip: page.offset,
    });
  }

  countApplicationsBy(where: Prisma.TeacherApplicationWhereInput): Promise<number> {
    return this.prisma.teacherApplication.count({ where });
  }

  /** Updates only if the application still has `expectedStatus`; null if it changed meanwhile. */
  async updateApplication(
    id: string,
    expectedStatus: ApplicationStatus,
    data: Prisma.TeacherApplicationUncheckedUpdateInput,
    tx?: TransactionClient,
  ): Promise<ApplicationRecord | null> {
    const client = tx ?? this.prisma;
    const { count } = await client.teacherApplication.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
    if (count === 0) return null;
    return client.teacherApplication.findUnique({ where: { id }, select: applicationSelect });
  }

  getPurgeableApplications(onOrBefore: Date): Promise<Array<{ id: string; cvUrl: string }>> {
    return this.prisma.teacherApplication.findMany({
      where: { status: ApplicationStatus.REJECTED, purgeAfter: { lte: onOrBefore } },
      select: { id: true, cvUrl: true },
    });
  }

  /** Deletes rejected applications only; never a hired or pending one. */
  async deleteRejectedApplications(ids: string[], tx?: TransactionClient): Promise<number> {
    const { count } = await (tx ?? this.prisma).teacherApplication.deleteMany({
      where: { id: { in: ids }, status: ApplicationStatus.REJECTED },
    });
    return count;
  }
}
