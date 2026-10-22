import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const boardSelect = { id: true, name: true, code: true } satisfies Prisma.BoardSelect;
const levelSelect = {
  id: true,
  boardId: true,
  name: true,
  orderIndex: true,
} satisfies Prisma.LevelSelect;
const subjectSelect = { id: true, name: true } satisfies Prisma.SubjectSelect;

export type BoardRecord = Prisma.BoardGetPayload<{ select: typeof boardSelect }>;
export type LevelRecord = Prisma.LevelGetPayload<{ select: typeof levelSelect }>;
export type SubjectRecord = Prisma.SubjectGetPayload<{ select: typeof subjectSelect }>;

/** Read-only access to boards, levels and subjects. Reference data is not teacher-owned. */
@Injectable()
export class ReferenceDataDao {
  constructor(private readonly prisma: PrismaService) {}

  getBoardsBy(where: Prisma.BoardWhereInput): Promise<BoardRecord[]> {
    return this.prisma.board.findMany({ where, select: boardSelect, orderBy: { name: 'asc' } });
  }

  getBoardBy(where: Prisma.BoardWhereInput): Promise<BoardRecord | null> {
    return this.prisma.board.findFirst({ where, select: boardSelect });
  }

  getLevelsBy(where: Prisma.LevelWhereInput): Promise<LevelRecord[]> {
    return this.prisma.level.findMany({
      where,
      select: levelSelect,
      orderBy: { orderIndex: 'asc' },
    });
  }

  getLevelBy(where: Prisma.LevelWhereInput): Promise<LevelRecord | null> {
    return this.prisma.level.findFirst({ where, select: levelSelect });
  }

  getSubjectsBy(where: Prisma.SubjectWhereInput): Promise<SubjectRecord[]> {
    return this.prisma.subject.findMany({ where, select: subjectSelect, orderBy: { name: 'asc' } });
  }

  getSubjectBy(where: Prisma.SubjectWhereInput): Promise<SubjectRecord | null> {
    return this.prisma.subject.findFirst({ where, select: subjectSelect });
  }
}
