import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'RoleContext123!';

describe('Role switching for dual-role accounts (#109)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  /** An account with the given roles. ADMIN accounts get MFA, so loginAs returns a verified session. */
  async function account(roles: Role[]): Promise<{ id: string; email: string }> {
    const email = uniqueEmail('role-context');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `Context ${roles.join('+')}`,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        isEmailVerified: true,
        mfaEnabledAt: roles.includes('ADMIN') ? new Date() : null,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    return { id: user.id, email };
  }
  const login = (email: string) => loginAs(app, { email, password: PASSWORD });

  const adminRoute = (cookie: string) => http().get('/admin/users?limit=1').set('Cookie', cookie);
  const teacherRoute = (cookie: string) => http().get('/teacher/courses').set('Cookie', cookie);
  const me = (cookie: string) => http().get('/auth/me').set('Cookie', cookie);
  const switchTo = (cookie: string, role: string) =>
    http().post('/auth/context').set('Cookie', cookie).send({ role });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('an ADMIN+TEACHER account', () => {
    let dual: { id: string; email: string };
    let cookie: string;

    beforeAll(async () => {
      dual = await account(['ADMIN', 'TEACHER']);
      cookie = await login(dual.email);
    });

    it('starts in the ADMIN context, and /auth/me says so and lists both contexts', async () => {
      const res = await me(cookie).expect(200);
      expect(res.body.data).toMatchObject({
        activeContext: 'ADMIN',
        availableContexts: ['ADMIN', 'TEACHER'],
      });
      expect([...res.body.data.roles].sort()).toEqual(['ADMIN', 'TEACHER']);
    });

    it('in the ADMIN context: admin routes work, teacher routes name the context needed', async () => {
      await adminRoute(cookie).expect(200);
      const res = await teacherRoute(cookie).expect(403);
      expect(res.body.error).toMatchObject({
        name: 'ROLE_CONTEXT_REQUIRED',
        info: { requiredContext: 'TEACHER', activeContext: 'ADMIN' },
      });
    });

    it('switches to TEACHER explicitly (audited); then only teacher routes work', async () => {
      const switched = await switchTo(cookie, 'TEACHER').expect(200);
      expect(switched.body.data.activeContext).toBe('TEACHER');
      expect((await me(cookie).expect(200)).body.data.activeContext).toBe('TEACHER');

      await teacherRoute(cookie).expect(200);
      const res = await adminRoute(cookie).expect(403);
      expect(res.body.error).toMatchObject({
        name: 'ROLE_CONTEXT_REQUIRED',
        info: { requiredContext: 'ADMIN', activeContext: 'TEACHER' },
      });

      const audit = await prisma.auditLog.findMany({
        where: { actorUserId: dual.id, action: 'ROLE_CONTEXT_SWITCHED' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        entityType: 'session',
        details: { from: 'ADMIN', to: 'TEACHER' },
      });
    });

    it('switching to the current context changes nothing and is not audited again', async () => {
      await switchTo(cookie, 'TEACHER').expect(200);
      expect(
        await prisma.auditLog.count({
          where: { actorUserId: dual.id, action: 'ROLE_CONTEXT_SWITCHED' },
        }),
      ).toBe(1);
    });

    it('the context belongs to the session: a new login starts in ADMIN again', async () => {
      const second = await login(dual.email);
      expect((await me(second).expect(200)).body.data.activeContext).toBe('ADMIN');
      expect((await me(cookie).expect(200)).body.data.activeContext).toBe('TEACHER');
    });

    it('switches back to ADMIN', async () => {
      await switchTo(cookie, 'ADMIN').expect(200);
      await adminRoute(cookie).expect(200);
      await teacherRoute(cookie).expect(403);
    });

    it('rejects anything but ADMIN or TEACHER', async () => {
      await switchTo(cookie, 'STUDENT').expect(400);
      await http().post('/auth/context').set('Cookie', cookie).send({}).expect(400);
    });
  });

  it('losing one of the roles ends the context: the remaining role just works', async () => {
    const dual = await account(['ADMIN', 'TEACHER']);
    const cookie = await login(dual.email);
    await switchTo(cookie, 'TEACHER').expect(200);
    await prisma.userRole.deleteMany({ where: { userId: dual.id, role: 'TEACHER' } });

    expect((await me(cookie).expect(200)).body.data).toMatchObject({
      activeContext: null,
      availableContexts: [],
    });
    await adminRoute(cookie).expect(200);
  });

  describe('single-role accounts are unaffected', () => {
    it('a teacher has no context, cannot switch, and gets a plain 403 on admin routes', async () => {
      const cookie = await loginAs(app, SEEDED.teacherA);
      expect((await me(cookie).expect(200)).body.data).toMatchObject({
        roles: ['TEACHER'],
        activeContext: null,
        availableContexts: [],
      });
      await teacherRoute(cookie).expect(200);
      expect((await adminRoute(cookie).expect(403)).body.error.name).toBe('FORBIDDEN');
      expect((await switchTo(cookie, 'ADMIN').expect(403)).body.error.name).toBe('FORBIDDEN');
      expect((await switchTo(cookie, 'TEACHER').expect(403)).body.error.name).toBe('FORBIDDEN');
    });

    it('an admin has no context and gets a plain 403 on teacher routes', async () => {
      const cookie = await loginAs(app, SEEDED.admin);
      expect((await me(cookie).expect(200)).body.data.activeContext).toBeNull();
      await adminRoute(cookie).expect(200);
      expect((await teacherRoute(cookie).expect(403)).body.error.name).toBe('FORBIDDEN');
      await switchTo(cookie, 'TEACHER').expect(403);
    });

    it('anonymous callers get 401', async () => {
      await http().post('/auth/context').send({ role: 'ADMIN' }).expect(401);
    });
  });
});
