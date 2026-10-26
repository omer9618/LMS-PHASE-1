import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { mailbox, tokenFromLastEmail, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'a perfectly long passphrase';

describe('Accounts: registration and verification (#11), password reset (#13)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function register(email: string, extra: Record<string, string> = {}) {
    return http()
      .post('/auth/register')
      .send({ email, password: PASSWORD, fullName: 'Ayesha Khan', ...extra });
  }

  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  describe('registration', () => {
    it('creates a signed-in STUDENT with optional guardian details and emails a verification link', async () => {
      const email = uniqueEmail('student');
      const res = await register(email, {
        guardianName: 'Imran Khan',
        guardianEmail: 'imran@example.com',
        guardianPhone: '+92 300 1234567',
      }).expect(201);

      expect(res.body.data.user).toEqual({
        id: expect.any(String),
        email,
        fullName: 'Ayesha Khan',
        isEmailVerified: false,
        roles: ['STUDENT'],
      });
      const me = await http().get('/auth/me').set('Cookie', cookieOf(res)).expect(200);
      expect(me.body.data.email).toBe(email);

      const guardian = await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { email }, select: { guardianPhone: true } });
      expect(guardian.guardianPhone).toBe('+92 300 1234567');
      expect(mailbox(app).lastTo(email, 'EMAIL_VERIFICATION')).toBeDefined();
    });

    it('works without guardian details', async () => {
      await register(uniqueEmail('adult')).expect(201);
    });

    it('rejects a duplicate email (case-insensitive) and a weak password', async () => {
      const email = uniqueEmail('dup');
      await register(email).expect(201);
      const dup = await register(email.toUpperCase()).expect(409);
      expect(dup.body.error.info).toEqual({ field: 'email' });

      const weak = await http()
        .post('/auth/register')
        .send({ email: uniqueEmail('weak'), password: 'short', fullName: 'X Y' })
        .expect(400);
      expect(weak.body.error.name).toBe('VALIDATION_FAILED');
    });
  });

  describe('email verification', () => {
    it('verifies with the emailed link, exactly once', async () => {
      const email = uniqueEmail('verify');
      const res = await register(email).expect(201);
      const token = tokenFromLastEmail(app, email, 'EMAIL_VERIFICATION');

      await http().post('/auth/verify-email').send({ token }).expect(200);
      const me = await http().get('/auth/me').set('Cookie', cookieOf(res)).expect(200);
      expect(me.body.data.isEmailVerified).toBe(true);

      const again = await http().post('/auth/verify-email').send({ token }).expect(400);
      expect(again.body.error.name).toBe('INVALID_TOKEN');
    });

    it('resending invalidates the earlier link', async () => {
      const email = uniqueEmail('resend');
      const res = await register(email).expect(201);
      const first = tokenFromLastEmail(app, email, 'EMAIL_VERIFICATION');

      await http().post('/auth/verify-email/resend').set('Cookie', cookieOf(res)).expect(200);
      const second = tokenFromLastEmail(app, email, 'EMAIL_VERIFICATION');
      expect(second).not.toBe(first);

      await http().post('/auth/verify-email').send({ token: first }).expect(400);
      await http().post('/auth/verify-email').send({ token: second }).expect(200);
    });

    it('rejects an expired link', async () => {
      const email = uniqueEmail('expired');
      await register(email).expect(201);
      const token = tokenFromLastEmail(app, email, 'EMAIL_VERIFICATION');
      await app.get(PrismaService).authToken.updateMany({
        where: { user: { email }, purpose: 'EMAIL_VERIFICATION' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post('/auth/verify-email').send({ token }).expect(400);
    });
  });

  describe('password reset', () => {
    it('answers identically for unknown emails and sends nothing', async () => {
      const unknown = uniqueEmail('nobody');
      const res = await http()
        .post('/auth/password-reset/request')
        .send({ email: unknown })
        .expect(200);
      expect(res.body.data).toEqual({ requested: true });
      expect(mailbox(app).lastTo(unknown)).toBeUndefined();
    });

    it('resets with a single-use link, signs out every session, and audits it', async () => {
      const email = uniqueEmail('reset');
      const registered = await register(email).expect(201);
      const oldCookie = cookieOf(registered);

      await http().post('/auth/password-reset/request').send({ email }).expect(200);
      const token = tokenFromLastEmail(app, email, 'PASSWORD_RESET');
      const newPassword = 'another long passphrase entirely';

      await http()
        .post('/auth/password-reset/confirm')
        .send({ token, password: newPassword })
        .expect(200);

      // Old sessions are dead, the old password fails, the new one works.
      await http().get('/auth/me').set('Cookie', oldCookie).expect(401);
      await http().post('/auth/login').send({ email, password: PASSWORD }).expect(401);
      await http().post('/auth/login').send({ email, password: newPassword }).expect(200);

      // Single use.
      await http()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'yet another long passphrase' })
        .expect(400);

      const audit = await app.get(PrismaService).auditLog.findFirst({
        where: { action: 'PASSWORD_RESET', actor: { email } },
      });
      expect(audit).not.toBeNull();
    });

    it('a newer reset request invalidates the earlier link', async () => {
      const email = uniqueEmail('reset2');
      await register(email).expect(201);
      await http().post('/auth/password-reset/request').send({ email }).expect(200);
      const first = tokenFromLastEmail(app, email, 'PASSWORD_RESET');
      await http().post('/auth/password-reset/request').send({ email }).expect(200);

      await http()
        .post('/auth/password-reset/confirm')
        .send({ token: first, password: 'a different long passphrase' })
        .expect(400);
    });
  });
});
