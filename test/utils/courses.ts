import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

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

/**
 * Creates a DRAFT course through the API. By default it is also made submittable (#34): one section
 * with a free-preview video lesson. Pass `{ withDemo: false }` for an incomplete course.
 */
export async function createCourse(
  app: NestExpressApplication,
  cookie: string,
  ids: Classification,
  title: string,
  options: { withDemo?: boolean } = {},
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
  const course = res.body.data;
  if (options.withDemo !== false) await addDemoLesson(app, cookie, course.id);
  return course;
}

/**
 * Adds a section with a free-preview video lesson. Until the upload flow (#35/#36) exists, the
 * video asset is attached directly in the database: clients can never attach videos by id.
 */
export async function addDemoLesson(
  app: NestExpressApplication,
  cookie: string,
  courseId: string,
): Promise<string> {
  const http = request(app.getHttpServer());
  const outline = await http
    .post(`/teacher/courses/${courseId}/sections`)
    .set('Cookie', cookie)
    .send({ title: 'Introduction' })
    .expect(201);
  const section = outline.body.data.sections.at(-1);
  const withLesson = await request(app.getHttpServer())
    .post(`/teacher/courses/${courseId}/sections/${section.id}/lessons`)
    .set('Cookie', cookie)
    .send({ title: 'Welcome video', type: 'VIDEO', isFreePreview: true })
    .expect(201);
  const lesson = withLesson.body.data.sections.at(-1).lessons.at(-1);
  const prisma = app.get(PrismaService);
  const asset = await prisma.videoAsset.create({
    data: { provider: 'BUNNY', providerVideoId: `test-${lesson.id}`, status: 'READY' },
  });
  await prisma.lesson.update({ where: { id: lesson.id }, data: { videoAssetId: asset.id } });
  return lesson.id;
}
