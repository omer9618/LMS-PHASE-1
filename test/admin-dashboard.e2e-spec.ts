import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { mailbox, tokenFromLastEmail, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'AdminDashboard123!';

describe('Admin dashboard and account management (#102, #103)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let teacher: string;
  let ids: Classification;
  const http = () => request(app.getHttpServer());

  async function account(roles: Role[], status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const email = uniqueEmail('admin-dash');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `Dash ${roles.join('+')}`,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        isEmailVerified: true,
        status,
        mfaEnabledAt: roles.includes('ADMIN') ? new Date() : null,
        roles: { create: roles.map((role) => ({ role })) },
      },
    });
    return { id: user.id, email };
  }

  async function freeCourse(title: string): Promise<string> {
    const course = await createCourse(app, teacher, ids, title);
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return course.id;
  }

  const dashboard = async () =>
    (await http().get('/admin/dashboard').set('Cookie', admin).expect(200)).body.data;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAs(app, SEEDED.admin);
    teacher = await loginAs(app, SEEDED.teacherA);
    ids = await classification(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/dashboard (#102)', () => {
    it('returns the queue counts, matching the database', async () => {
      const data = await dashboard();
      const since = new Date(data.today.since);
      expect(since.toISOString()).toMatch(/T00:00:00\.000Z$/);
      const [courses, applications, proofs, concerns, enrollments] = await Promise.all([
        prisma.course.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.teacherApplication.count({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        }),
        prisma.order.count({ where: { status: 'PROOF_SUBMITTED' } }),
        prisma.payoutDispute.count({ where: { status: 'OPEN' } }),
        prisma.enrollment.count({ where: { grantedAt: { gte: since } } }),
      ]);
      expect(data).toEqual({
        generatedAt: expect.any(String),
        queues: {
          coursesPendingApproval: courses,
          teacherApplicationsOpen: applications,
          paymentVerificationsPending: proofs,
          payoutConcerns: concerns,
        },
        needsAttention: courses + applications + proofs + concerns,
        today: { since: expect.any(String), enrollmentsGranted: enrollments },
      });
    });

    it('moves when a course is submitted, an application arrives and someone enrolls', async () => {
      const before = await dashboard();

      const pending = await createCourse(app, teacher, ids, 'Dashboard pending course');
      await http().post(`/teacher/courses/${pending.id}/submit`).set('Cookie', teacher).expect(200);
      await prisma.teacherApplication.create({
        data: {
          applicantName: 'Dash Applicant',
          applicantEmail: uniqueEmail('applicant'),
          cvUrl: 'cv/dashboard-test.pdf',
        },
      });
      const courseId = await freeCourse('Dashboard free course');
      const student = await account(['STUDENT']);
      const studentCookie = await loginAs(app, { email: student.email, password: PASSWORD });
      await http().post(`/courses/${courseId}/enroll`).set('Cookie', studentCookie).expect(200);

      const after = await dashboard();
      expect(after.queues.coursesPendingApproval).toBe(before.queues.coursesPendingApproval + 1);
      expect(after.queues.teacherApplicationsOpen).toBe(before.queues.teacherApplicationsOpen + 1);
      expect(after.today.enrollmentsGranted).toBe(before.today.enrollmentsGranted + 1);
    });

    it('is admin-only', async () => {
      await http().get('/admin/dashboard').expect(401);
      await http().get('/admin/dashboard').set('Cookie', teacher).expect(403);
    });

    it('a dual-role account needs the ADMIN context (#109)', async () => {
      const dual = await account(['ADMIN', 'TEACHER']);
      const cookie = await loginAs(app, { email: dual.email, password: PASSWORD });
      await http().get('/admin/dashboard').set('Cookie', cookie).expect(200);
      await http()
        .post('/auth/context')
        .set('Cookie', cookie)
        .send({ role: 'TEACHER' })
        .expect(200);
      const res = await http().get('/admin/dashboard').set('Cookie', cookie).expect(403);
      expect(res.body.error.name).toBe('ROLE_CONTEXT_REQUIRED');
    });
  });

  describe('GET /admin/users/:userId/overview (#103)', () => {
    it('shows a student with their enrollments and no courses taught', async () => {
      const courseId = await freeCourse('Overview free course');
      const student = await account(['STUDENT']);
      const cookie = await loginAs(app, { email: student.email, password: PASSWORD });
      await http().post(`/courses/${courseId}/enroll`).set('Cookie', cookie).expect(200);

      const res = await http()
        .get(`/admin/users/${student.id}/overview`)
        .set('Cookie', admin)
        .expect(200);
      expect(res.body.data).toMatchObject({
        user: { id: student.id, email: student.email, roles: ['STUDENT'] },
        enrollments: { total: 1, items: [{ course: { id: courseId }, status: 'ACTIVE' }] },
        coursesTaught: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|mfaSecret/);
    });

    it('shows a teacher with the courses they teach, in every status', async () => {
      const teacherA = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.teacherA.email },
      });
      const draft = await createCourse(app, teacher, ids, 'Overview draft course');
      const res = await http()
        .get(`/admin/users/${teacherA.id}/overview`)
        .set('Cookie', admin)
        .expect(200);
      const total = await prisma.course.count({ where: { teacherId: teacherA.id } });
      expect(res.body.data.coursesTaught.total).toBe(total);
      expect(res.body.data.coursesTaught.items[0]).toMatchObject({
        id: draft.id,
        status: 'DRAFT',
      });
    });

    it('is 404 for unknown users and admin-only', async () => {
      await http()
        .get('/admin/users/00000000-0000-4000-8000-000000000000/overview')
        .set('Cookie', admin)
        .expect(404);
      const someone = await account(['STUDENT']);
      await http().get(`/admin/users/${someone.id}/overview`).set('Cookie', teacher).expect(403);
      await http().get(`/admin/users/${someone.id}/overview`).expect(401);
    });
  });

  describe('POST /admin/users/:userId/password-reset (#103)', () => {
    it('emails a working reset link and audits it; the admin never sees the token', async () => {
      const user = await account(['TEACHER']);
      const res = await http()
        .post(`/admin/users/${user.id}/password-reset`)
        .set('Cookie', admin)
        .expect(200);
      expect(res.body.data).toEqual({ sent: true });
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
      expect(mailbox(app).lastTo(user.email, 'PASSWORD_RESET')).toBeDefined();

      const token = tokenFromLastEmail(app, user.email, 'PASSWORD_RESET');
      await http()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'BrandNewPassword123!' })
        .expect(200);
      await loginAs(app, { email: user.email, password: 'BrandNewPassword123!' });

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: user.id, action: 'USER_PASSWORD_RESET_SENT' },
      });
      const adminUser = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.admin.email },
      });
      expect(audit.actorUserId).toBe(adminUser.id);
    });

    it('refuses suspended accounts, unknown users and non-admins', async () => {
      const suspended = await account(['STUDENT'], 'SUSPENDED');
      await http()
        .post(`/admin/users/${suspended.id}/password-reset`)
        .set('Cookie', admin)
        .expect(409);
      await http()
        .post('/admin/users/00000000-0000-4000-8000-000000000000/password-reset')
        .set('Cookie', admin)
        .expect(404);
      await http()
        .post(`/admin/users/${suspended.id}/password-reset`)
        .set('Cookie', teacher)
        .expect(403);
    });
  });
});
