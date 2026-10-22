import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import {
  BoardRecord,
  LevelRecord,
  ReferenceDataDao,
  SubjectRecord,
} from '../dao/reference-data.dao';

/** What reference endpoints return. Controllers import them from here, never from the DAO. */
export type { BoardRecord, LevelRecord, SubjectRecord };

export interface CourseClassification {
  boardId: string;
  levelId: string;
  subjectId: string;
}

@Injectable()
export class ReferenceDataService {
  constructor(private readonly referenceDataDao: ReferenceDataDao) {}

  listBoards(): Promise<BoardRecord[]> {
    return this.referenceDataDao.getBoardsBy({ isActive: true });
  }

  async listLevels(boardId: string): Promise<LevelRecord[]> {
    const board = await this.referenceDataDao.getBoardBy({ id: boardId, isActive: true });
    if (!board) {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'board', id: boardId });
    }
    return this.referenceDataDao.getLevelsBy({ boardId, isActive: true });
  }

  listSubjects(): Promise<SubjectRecord[]> {
    return this.referenceDataDao.getSubjectsBy({ isActive: true });
  }

  /**
   * Checks a course's board/level/subject before it is written, so the teacher gets a precise
   * message. The composite FK on courses remains the backstop.
   */
  async assertValidClassification({
    boardId,
    levelId,
    subjectId,
  }: CourseClassification): Promise<void> {
    const [board, level, subject] = await Promise.all([
      this.referenceDataDao.getBoardBy({ id: boardId, isActive: true }),
      this.referenceDataDao.getLevelBy({ id: levelId, isActive: true }),
      this.referenceDataDao.getSubjectBy({ id: subjectId, isActive: true }),
    ]);

    if (!board) {
      throw invalidReference('boardId', 'The selected board does not exist');
    }
    if (!level) {
      throw invalidReference('levelId', 'The selected level does not exist');
    }
    if (level.boardId !== boardId) {
      throw invalidReference('levelId', 'The selected level does not belong to the selected board');
    }
    if (!subject) {
      throw invalidReference('subjectId', 'The selected subject does not exist');
    }
  }
}

function invalidReference(field: string, message: string): AppException {
  return new AppException(ErrorCode.INVALID_REFERENCE, { field }, undefined, { message });
}
