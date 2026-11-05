import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ENV } from '../src/config/config.module';
import type { Env } from '../src/config/env.schema';
import { loginAs, SEEDED } from './utils/auth';
import { createTestApp } from './utils/test-app';

/** #119: security headers, the CORS allowlist and the Origin check on writes. */
describe('HTTP security (#119)', () => {
  let app: NestExpressApplication;
  let webOrigin: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    webOrigin = new URL(app.get<Env>(ENV).APP_PUBLIC_URL).origin;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends hardening headers on every response, errors included', async () => {
    for (const res of [await http().get('/health'), await http().get('/no-such-route')]) {
      expect(res.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-site',
        'cache-control': 'no-store',
      });
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('allows CORS with credentials for the web app only', async () => {
    const allowed = await http()
      .options('/auth/login')
      .set('Origin', webOrigin)
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await http().get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses state-changing requests from an untrusted Origin (CSRF defence in depth)', async () => {
    const res = await http()
      .post('/auth/login')
      .set('Origin', 'https://evil.example')
      .send(SEEDED.teacherA)
      .expect(403);
    expect(res.body.error).toMatchObject({
      name: 'FORBIDDEN',
      info: { reason: 'ORIGIN_NOT_ALLOWED' },
    });

    const cookie = await loginAs(app, SEEDED.teacherA);
    await http()
      .post('/teacher/courses')
      .set('Cookie', cookie)
      .set('Origin', 'null')
      .send({})
      .expect(403);
  });

  it('lets trusted origins, server-to-server calls and reads through', async () => {
    await http().post('/auth/login').set('Origin', webOrigin).send(SEEDED.teacherA).expect(200);
    await http().post('/auth/login').send(SEEDED.teacherA).expect(200);
    await http().get('/health').set('Origin', 'https://evil.example').expect(200);
  });
});
