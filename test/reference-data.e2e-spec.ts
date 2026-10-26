import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Reference data (public)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists boards, then the levels of one board in order', async () => {
    const boards = await request(app.getHttpServer()).get('/boards').expect(200);
    const cambridge = boards.body.data.find((b: { name: string }) => b.name === 'Cambridge');
    expect(cambridge).toMatchObject({ id: expect.any(String), code: 'CAM' });

    const levels = await request(app.getHttpServer())
      .get(`/boards/${cambridge.id}/levels`)
      .expect(200);
    expect(levels.body.data.map((l: { name: string }) => l.name)).toEqual([
      'IGCSE',
      'O Level',
      'A Level',
    ]);
  });

  it('lists subjects', async () => {
    const res = await request(app.getHttpServer()).get('/subjects').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('rejects a malformed board id with VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer()).get('/boards/not-a-uuid/levels').expect(400);
    expect(res.body.error).toMatchObject({
      name: 'VALIDATION_FAILED',
      info: { location: 'param', issues: [expect.objectContaining({ path: 'boardId' })] },
    });
  });

  it('returns 404 for an unknown board', async () => {
    await request(app.getHttpServer())
      .get('/boards/3f1e9a52-8d7b-4c1e-9f0a-2b6d4e8c1a7f/levels')
      .expect(404);
  });
});
