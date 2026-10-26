import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { RATE_LIMITS } from '../src/common/rate-limit/rate-limits';
import { createTestApp } from './utils/test-app';

/**
 * #17. The other suites run with limiting off (they log in many times from one IP); this file
 * turns it back on for its own app instance. Jest gives each test file its own environment.
 */
describe('Rate limiting on authentication and public endpoints (#17)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks repeated login attempts with 429, the error envelope and Retry-After', async () => {
    const attempt = () =>
      http().post('/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password' });

    for (let i = 0; i < RATE_LIMITS.LOGIN.limit; i++) {
      await attempt().expect(401);
    }
    const limited = await attempt().expect(429);
    expect(limited.body).toEqual({
      success: false,
      error: { name: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' },
    });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits password reset requests separately from login', async () => {
    for (let i = 0; i < RATE_LIMITS.ACCOUNT_EMAIL.limit; i++) {
      await http()
        .post('/auth/password-reset/request')
        .send({ email: 'nobody@test.local' })
        .expect(200);
    }
    await http()
      .post('/auth/password-reset/request')
      .send({ email: 'nobody@test.local' })
      .expect(429);
  });

  it('never limits the health check', async () => {
    for (let i = 0; i < 20; i++) {
      await http().get('/health').expect(200);
    }
  });
});
