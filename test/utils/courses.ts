import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

export interface Classification {
  boardId: string;
  levelId: string;
  subjectId: string;
}

/** A valid board/level/subject triple, read through the public reference endpoints. */
export async function classification(
  app: NestExpressApplication,
  boardName = 'Cambridge',
): Promise<Classification & { otherBoardLevelId: string }> {
  const server = app.getHttpServer();
  const boards = (await request(server).get('/boards').expect(200)).body.data as Array<{
    id: string;
    name: string;
  }>;
  const board = boards.find((b) => b.name === boardName)!;
  const other = boards.find((b) => b.name !== boardName)!;
  const levels = (await request(server).get(`/boards/${board.id}/levels`).expect(200)).body.data;
  const otherLevels = (await request(server).get(`/boards/${other.id}/levels`).expect(200)).body
    .data;
  const subjects = (await request(server).get('/subjects').expect(200)).body.data;
  return {
    boardId: board.id,
    levelId: levels[0].id,
    subjectId: subjects[0].id,
    otherBoardLevelId: otherLevels[0].id,
  };
}

export async function createCourse(
  app: NestExpressApplication,
  cookie: string,
  ids: Classification,
  title: string,
): Promise<{ id: string; status: string; teacherId: string }> {
  const res = await request(app.getHttpServer())
    .post('/teacher/courses')
    .set('Cookie', cookie)
    .send({
      boardId: ids.boardId,
      levelId: ids.levelId,
      subjectId: ids.subjectId,
      title,
      syllabusArea: 'Algebra',
    })
    .expect(201);
  return res.body.data;
}
