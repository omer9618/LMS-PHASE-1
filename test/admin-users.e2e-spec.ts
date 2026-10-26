import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { tokenFromLastEmail, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'new staff member passphrase';

describe('Admin account management (#15)', () => {
  let app: NestExpressApplication;
  let admin: string;
  const http = () => request(app.getHttpServer());
  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAs(app, SEEDED.admin);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Creates an account and completes the emailed set-password step. */
  async function createStaff(roles: string[]) {
    const email = uniqueEmail('staff');
    const res = await http()
      .post('/admin/users')
      .set('Cookie', admin)
      .send({ email, fullName: 'New Staff', roles })
      .expect(201);
    const token = tokenFromLastEmail(app, email, 'ACCOUNT_CREATED');
    await http()
      .post('/auth/password-reset/confirm')
      .send({ token, password: PASSWORD })
      .expect(200);
    return { id: res.body.data.id as string, email };
  }

  const login = (email: string) => http().post('/auth/login').send({ email, password: PASSWORD });

  it('creates a teacher account without ever setting its password; the user sets it from the email', async () => {
    const email = uniqueEmail('teacher');
    const res = await http()
      .post('/admin/users')
      .set('Cookie', admin)
      .send({ email, fullName: 'Sana Teacher', roles: ['TEACHER'] })
      .expect(201);
    expect(res.body.data).toMatchObject({
      email,
      fullName: 'Sana Teacher',
      roles: ['TEACHER'],
      status: 'ACTIVE',
      mfaEnabled: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|mfaSecret/);

    // No usable password yet: a clean 401, not a crash.
    await http().post('/auth/login').send({ email, password: '!' }).expect(401);
    await login(email).expect(401);

    const token = tokenFromLastEmail(app, email, 'ACCOUNT_CREATED');
    await http()
      .post('/auth/password-reset/confirm')
      .send({ token, password: PASSWORD })
      .expect(200);
    const signedIn = await login(email).expect(200);
    expect(signedIn.body.data.user).toMatchObject({ roles: ['TEACHER'], isEmailVerified: true });
  });

  it('refuses a duplicate email', async () => {
    await http()
      .post('/admin/users')
      .set('Cookie', admin)
      .send({ email: SEEDED.teacherA.email, fullName: 'Dup', roles: ['TEACHER'] })
      .expect(409);
  });

  it('suspends with a reason (signing the user out), then reactivates, both audited', async () => {
    const staff = await createStaff(['TEACHER']);
    const session = cookieOf(await login(staff.email).expect(200));

    const suspended = await http()
      .post(`/admin/users/${staff.id}/suspend`)
      .set('Cookie', admin)
      .send({ reason: 'Investigating a complaint' })
      .expect(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');
    await http().get('/auth/me').set('Cookie', session).expect(401);
    await login(staff.email).expect(401);

    await http()
      .post(`/admin/users/${staff.id}/suspend`)
      .set('Cookie', admin)
      .send({ reason: 'Again' })
      .expect(409);

    await http()
      .post(`/admin/users/${staff.id}/reactivate`)
      .set('Cookie', admin)
      .send({ reason: 'Complaint resolved' })
      .expect(200);
    await login(staff.email).expect(200);

    const audit = await http()
      .get(`/admin/audit-log?entityId=${staff.id}&entityType=user`)
      .set('Cookie', admin)
      .expect(200);
    const actions = audit.body.data.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual([
      'USER_REACTIVATED',
      'USER_SUSPENDED',
      'PASSWORD_RESET',
      'USER_CREATED',
    ]);
    expect(audit.body.data.items[1].details).toMatchObject({
      reason: 'Investigating a complaint',
      from: 'ACTIVE',
      to: 'SUSPENDED',
    });
  });

  it('admins cannot suspend themselves', async () => {
    const me = await http().get('/auth/me').set('Cookie', admin).expect(200);
    await http()
      .post(`/admin/users/${me.body.data.id}/suspend`)
      .set('Cookie', admin)
      .send({ reason: 'Testing self-suspension' })
      .expect(409);
  });

  it('grants and revokes roles as a set; a new admin must enrol MFA before admin routes', async () => {
    const staff = await createStaff(['TEACHER']);
    const granted = await http()
      .post(`/admin/users/${staff.id}/roles`)
      .set('Cookie', admin)
      .send({ role: 'ADMIN' })
      .expect(200);
    expect([...granted.body.data.roles].sort()).toEqual(['ADMIN', 'TEACHER']);

    const session = cookieOf(await login(staff.email).expect(200));
    const blocked = await http().get('/admin/users').set('Cookie', session).expect(403);
    expect(blocked.body.error.name).toBe('MFA_REQUIRED');

    const revoked = await http()
      .delete(`/admin/users/${staff.id}/roles/ADMIN`)
      .set('Cookie', admin)
      .expect(200);
    expect(revoked.body.data.roles).toEqual(['TEACHER']);
    await http().delete(`/admin/users/${staff.id}/roles/TEACHER`).set('Cookie', admin).expect(409);
  });

  it('lists and searches accounts by role, status and name or email', async () => {
    const res = await http()
      .get('/admin/users?role=TEACHER&status=ACTIVE&q=teacher.a')
      .set('Cookie', admin)
      .expect(200);
    expect(res.body.data.items.map((u: { email: string }) => u.email)).toContain(
      SEEDED.teacherA.email,
    );
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);

    const byName = await http().get('/admin/users?q=Teacher%20B').set('Cookie', admin).expect(200);
    expect(byName.body.data.items.map((u: { email: string }) => u.email)).toContain(
      SEEDED.teacherB.email,
    );
  });

  it('is admin-only', async () => {
    const teacher = await loginAs(app, SEEDED.teacherA);
    await http().get('/admin/users').set('Cookie', teacher).expect(403);
  });

  it('never stores a usable password for admin-created accounts until the user sets one', async () => {
    const email = uniqueEmail('nopw');
    await http()
      .post('/admin/users')
      .set('Cookie', admin)
      .send({ email, fullName: 'No Password', roles: ['ADMIN'] })
      .expect(201);
    const user = await app
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { email }, select: { passwordHash: true } });
    expect(user.passwordHash).toBe('!');
  });
});
