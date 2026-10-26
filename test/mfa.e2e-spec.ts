import type { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import request from 'supertest';
import { totpAt } from '../src/modules/auth/domain/totp';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'admin passphrase for mfa tests';

describe('MFA for admin accounts (#16)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  const codeIn = (secret: string, steps: number) =>
    totpAt(secret, new Date(Date.now() + steps * 30_000));

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(roles: Role[]) {
    const email = uniqueEmail('mfa');
    await app.get(PrismaService).user.create({
      data: {
        email,
        fullName: 'MFA Tester',
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified: true,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    return email;
  }

  const login = (email: string) => http().post('/auth/login').send({ email, password: PASSWORD });

  it('full admin journey: blocked until enrolled, enrol, then TOTP and recovery-code logins', async () => {
    const email = await createUser([Role.ADMIN]);

    // Before enrolment: signed in, but admin routes are blocked; enrolment routes are not.
    const first = await login(email).expect(200);
    const cookie = cookieOf(first);
    const otherDevice = cookieOf(await login(email).expect(200));
    const blocked = await http().get('/admin/settings').set('Cookie', cookie).expect(403);
    expect(blocked.body.error).toMatchObject({ name: 'MFA_REQUIRED', info: { enrolled: false } });
    await http().get('/auth/me').set('Cookie', cookie).expect(200);
    const status = await http().get('/auth/mfa').set('Cookie', cookie).expect(200);
    expect(status.body.data).toEqual({ enabled: false, required: true, recoveryCodesRemaining: 0 });

    // Enrol.
    const setup = await http().post('/auth/mfa/setup').set('Cookie', cookie).expect(200);
    const { secret, otpauthUri } = setup.body.data;
    expect(otpauthUri).toContain(`secret=${secret}`);
    await http()
      .post('/auth/mfa/enable')
      .set('Cookie', cookie)
      .send({ code: codeIn(secret, 5) })
      .expect(401);
    const enabled = await http()
      .post('/auth/mfa/enable')
      .set('Cookie', cookie)
      .send({ code: codeIn(secret, 0) })
      .expect(200);
    const recoveryCodes: string[] = enabled.body.data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);

    // The enrolling session is now verified; a session from before enrolment still is not.
    await http().get('/admin/settings').set('Cookie', cookie).expect(200);
    const stale = await http().get('/admin/settings').set('Cookie', otherDevice).expect(403);
    expect(stale.body.error.info).toEqual({ enrolled: true });

    // Password alone no longer signs in: it returns a challenge and no cookie.
    const challenge = await login(email).expect(200);
    expect(challenge.body.data).toEqual({
      mfaRequired: true,
      challengeToken: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(challenge.headers['set-cookie']).toBeUndefined();
    const { challengeToken } = challenge.body.data;

    // The code used to enrol cannot be replayed; the next step's code works once.
    await http()
      .post('/auth/login/mfa')
      .send({ challengeToken, code: codeIn(secret, 0) })
      .expect(401);
    const signedIn = await http()
      .post('/auth/login/mfa')
      .send({ challengeToken, code: codeIn(secret, 1) })
      .expect(200);
    await http().get('/admin/settings').set('Cookie', cookieOf(signedIn)).expect(200);

    // A challenge is single-use.
    await http()
      .post('/auth/login/mfa')
      .send({ challengeToken, code: codeIn(secret, 1) })
      .expect(400);

    // Recovery codes work once each, in any case/dash format.
    const c2 = (await login(email).expect(200)).body.data.challengeToken;
    await http()
      .post('/auth/login/mfa')
      .send({ challengeToken: c2, recoveryCode: recoveryCodes[0].toLowerCase() })
      .expect(200);
    const c3 = (await login(email).expect(200)).body.data.challengeToken;
    await http()
      .post('/auth/login/mfa')
      .send({ challengeToken: c3, recoveryCode: recoveryCodes[0] })
      .expect(401);

    // Admins cannot turn MFA off.
    await http()
      .post('/auth/mfa/disable')
      .set('Cookie', cookieOf(signedIn))
      .send({ code: codeIn(secret, -1) })
      .expect(409);

    const audit = await app.get(PrismaService).auditLog.findMany({
      where: { actor: { email }, action: { startsWith: 'MFA_' } },
      select: { action: true },
    });
    expect(audit.map((a) => a.action).sort()).toEqual(['MFA_ENABLED', 'MFA_RECOVERY_CODE_USED']);
  });

  it('non-admins are not forced into MFA but may enable and disable it', async () => {
    const email = await createUser([Role.TEACHER]);
    const cookie = cookieOf(await login(email).expect(200));
    await http().get('/teacher/courses').set('Cookie', cookie).expect(200);

    const { secret } = (await http().post('/auth/mfa/setup').set('Cookie', cookie).expect(200)).body
      .data;
    await http()
      .post('/auth/mfa/enable')
      .set('Cookie', cookie)
      .send({ code: codeIn(secret, 0) })
      .expect(200);
    await http()
      .post('/auth/mfa/disable')
      .set('Cookie', cookie)
      .send({ code: codeIn(secret, 1) })
      .expect(200);

    // Back to password-only login.
    const res = await login(email).expect(200);
    expect(res.body.data.user).toBeDefined();
  });

  it('rejects malformed second-factor requests', async () => {
    await http()
      .post('/auth/login/mfa')
      .send({ challengeToken: 'x', code: '123456', recoveryCode: 'ABCD-EFGH-JK' })
      .expect(400);
    await http().post('/auth/login/mfa').send({ challengeToken: 'x' }).expect(400);
  });
});
