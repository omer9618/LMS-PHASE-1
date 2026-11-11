import type { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { mailbox, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'first passphrase for account tests';
const NEW_PASSWORD = 'second passphrase for account tests';

describe('Account settings: password, name and devices', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser() {
    const email = uniqueEmail('acct');
    await app.get(PrismaService).user.create({
      data: {
        email,
        fullName: 'Account Tester',
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified: true,
        roles: { create: [{ role: Role.STUDENT }] },
      },
    });
    return email;
  }

  /** Signs in and returns the session cookie: each call is a new device. */
  async function signIn(email: string, password = PASSWORD) {
    return cookieOf(await http().post('/auth/login').send({ email, password }).expect(200));
  }

  it('needs a session for every route', async () => {
    await http().post('/account/password').send({}).expect(401);
    await http().patch('/account/profile').send({}).expect(401);
    await http().get('/account/sessions').expect(401);
    await http().post('/account/sessions/sign-out-others').expect(401);
  });

  it('changes the password, keeps this device, signs the others out, audits and emails', async () => {
    const email = await createUser();
    const phone = await signIn(email);
    const laptop = await signIn(email);

    // The current password must be right, and the new one acceptable and different.
    const wrong = await http()
      .post('/account/password')
      .set('Cookie', laptop)
      .send({ currentPassword: 'not the password', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(wrong.body.error.info.issues[0]).toMatchObject({ path: 'currentPassword' });
    await http()
      .post('/account/password')
      .set('Cookie', laptop)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(400);
    await http()
      .post('/account/password')
      .set('Cookie', laptop)
      .send({ currentPassword: PASSWORD, newPassword: 'short' })
      .expect(400);

    const changed = await http()
      .post('/account/password')
      .set('Cookie', laptop)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(changed.body.data).toEqual({ changed: true, otherSessionsEnded: 1 });

    await http().get('/auth/me').set('Cookie', laptop).expect(200);
    await http().get('/auth/me').set('Cookie', phone).expect(401);
    await http().post('/auth/login').send({ email, password: PASSWORD }).expect(401);
    await http().post('/auth/login').send({ email, password: NEW_PASSWORD }).expect(200);

    expect(mailbox(app).lastTo(email, 'PASSWORD_CHANGED')?.subject).toBe(
      'Your password was changed',
    );
    const audit = await app.get(PrismaService).auditLog.findMany({
      where: { actor: { email }, action: 'PASSWORD_CHANGED' },
      select: { details: true },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ otherSessionsEnded: 1 });
    expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
  });

  it('changes the display name, refusing control and direction-override characters', async () => {
    const email = await createUser();
    const cookie = await signIn(email);

    const renamed = await http()
      .patch('/account/profile')
      .set('Cookie', cookie)
      .send({ fullName: '  Ayesha Khan  ' })
      .expect(200);
    expect(renamed.body.data.fullName).toBe('Ayesha Khan');
    const me = await http().get('/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.data.fullName).toBe('Ayesha Khan');

    // Built from code points so this file holds no invisible or direction-control character.
    const NUL = String.fromCodePoint(0);
    const RLO = String.fromCodePoint(0x202e);
    for (const bad of [`Al${NUL}i`, `Ali${RLO}evil`, 'A', 'x'.repeat(121)]) {
      await http()
        .patch('/account/profile')
        .set('Cookie', cookie)
        .send({ fullName: bad })
        .expect(400);
    }
    await http()
      .patch('/account/profile')
      .set('Cookie', cookie)
      .send({ fullName: 'Ayesha Khan', roles: ['ADMIN'] })
      .expect(400);
  });

  it('lists devices, signs one out, never someone else’s, and can sign out all others', async () => {
    const email = await createUser();
    const stranger = await signIn(await createUser());
    const phone = await signIn(email);
    const tablet = await signIn(email);
    const laptop = await signIn(email);

    const list = await http().get('/account/sessions').set('Cookie', laptop).expect(200);
    const sessions: Array<{ id: string; current: boolean }> = list.body.data;
    expect(sessions).toHaveLength(3);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|token_hash/);

    const current = sessions.find((s) => s.current)!;
    const other = sessions.find((s) => !s.current)!;

    // The device in use is ended with sign out, not here.
    await http().delete(`/account/sessions/${current.id}`).set('Cookie', laptop).expect(409);
    // Someone else's session id looks exactly like one that does not exist.
    const strangerSessions = await http().get('/account/sessions').set('Cookie', stranger);
    await http()
      .delete(`/account/sessions/${strangerSessions.body.data[0].id}`)
      .set('Cookie', laptop)
      .expect(404);
    await http().get('/auth/me').set('Cookie', stranger).expect(200);

    await http().delete(`/account/sessions/${other.id}`).set('Cookie', laptop).expect(200);
    await http().delete(`/account/sessions/${other.id}`).set('Cookie', laptop).expect(404);

    const ended = await http()
      .post('/account/sessions/sign-out-others')
      .set('Cookie', laptop)
      .expect(200);
    expect(ended.body.data.ended).toBe(1);
    await http().get('/auth/me').set('Cookie', laptop).expect(200);
    for (const cookie of [phone, tablet]) {
      // One of these was ended by id above and the other here; both are dead.
      await http().get('/auth/me').set('Cookie', cookie).expect(401);
    }
    const after = await http().get('/account/sessions').set('Cookie', laptop).expect(200);
    expect(after.body.data).toHaveLength(1);
  });
});
