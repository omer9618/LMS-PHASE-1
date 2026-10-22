import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BoardParams, boardParamsSchema } from '../schemas/reference-data.schema';
import {
  BoardRecord,
  LevelRecord,
  ReferenceDataService,
  SubjectRecord,
} from '../services/reference-data.service';

/** Public, read-only lists for the course form. No admin CRUD here: that is not a ticket. */
@Public()
@Controller()
export class ReferenceDataController {
  constructor(private readonly referenceDataService: ReferenceDataService) {}

  @Get('boards')
  listBoards(): Promise<BoardRecord[]> {
    return this.referenceDataService.listBoards();
  }

  @Get('boards/:boardId/levels')
  listLevels(
    @Param(new ZodValidationPipe(boardParamsSchema)) params: BoardParams,
  ): Promise<LevelRecord[]> {
    return this.referenceDataService.listLevels(params.boardId);
  }

  @Get('subjects')
  listSubjects(): Promise<SubjectRecord[]> {
    return this.referenceDataService.listSubjects();
  }
}
