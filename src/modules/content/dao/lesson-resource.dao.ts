import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const resourceSelect = {
  id: true,
  lessonId: true,
  fileUrl: true,
  fileName: true,
  fileSizeBytes: true,
  orderIndex: true,
} satisfies Prisma.LessonResourceSelect;

export type LessonResourceRecord = Prisma.LessonResourceGetPayload<{
  select: typeof resourceSelect;
}>;

/**
 * Files attached to lessons (#38). Callers authorise the lesson first (through OutlineService or
 * the access rules); every lookup here is constrained to that lesson id.
 */
@Injectable()
export class LessonResourceDao {
  constructor(private readonly prisma: PrismaService) {}

  getResourcesBy(lessonId: string, tx?: TransactionClient): Promise<LessonResourceRecord[]> {
    return (tx ?? this.prisma).lessonResource.findMany({
      where: { lessonId },
      select: resourceSelect,
      orderBy: { orderIndex: 'asc' },
    });
  }

  getResourceBy(lessonId: string, resourceId: string): Promise<LessonResourceRecord | null> {
    return this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
      select: resourceSelect,
    });
  }

  createResource(
    data: Prisma.LessonResourceUncheckedCreateInput,
    tx: TransactionClient,
  ): Promise<LessonResourceRecord> {
    return tx.lessonResource.create({ data, select: resourceSelect });
  }

  async deleteResource(resourceId: string, tx: TransactionClient): Promise<void> {
    await tx.lessonResource.delete({ where: { id: resourceId }, select: { id: true } });
  }

  async setResourceOrder(orderedIds: string[], tx: TransactionClient): Promise<void> {
    for (const [orderIndex, id] of orderedIds.entries()) {
      await tx.lessonResource.update({ where: { id }, data: { orderIndex }, select: { id: true } });
    }
  }
}
