import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('GET /health', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database as up, wrapped in the success envelope, with a request id', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toEqual({
      success: false,
      error: { name: 'ROUTE_NOT_FOUND', message: 'Route not found' },
    });
  });
});
