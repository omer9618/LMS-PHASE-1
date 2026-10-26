import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Auth: login, session, logout (#12, #10, #14)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access to a protected route', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(res.body.error.name).toBe('UNAUTHENTICATED');
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: SEEDED.admin.email, password: 'wrong-password' })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@lms.local', password: 'wrong-password' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('logs in with an HTTP-only cookie, never returns the token or hash, and is case-insensitive', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: SEEDED.admin.email.toUpperCase(), password: SEEDED.admin.password })
      .expect(200);

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data).toEqual({
      user: { id: expect.any(String), email: SEEDED.admin.email, roles: ['ADMIN'] },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token/i);
  });

  it('logout revokes the session server-side: the old cookie stops working', async () => {
    const cookie = await loginAs(app, SEEDED.admin);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(200);

    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(200);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );

    // Replaying the captured cookie must fail: revocation is in the database, not the browser.
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(401);
  });

  it('one account can hold ADMIN and TEACHER at once (#10)', async () => {
    const prisma = app.get(PrismaService);
    const email = 'multi-role@test.local';
    const password = 'MultiRolePassword123!';
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        email,
        passwordHash,
        roles: { create: [{ role: 'ADMIN' }, { role: 'TEACHER' }] },
      },
    });

    const cookie = await loginAs(app, { email, password });
    const me = await request(app.getHttpServer()).get('/auth/me').set('Cookie', cookie).expect(200);
    expect([...me.body.data.roles].sort()).toEqual(['ADMIN', 'TEACHER']);
  });
});
