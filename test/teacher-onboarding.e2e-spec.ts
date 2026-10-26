import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, createCourse } from './utils/courses';
import { mailbox, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n', 'latin1');

describe('Teacher onboarding (#18–#23)', () => {
  let app: NestExpressApplication;
  let admin: string;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAs(app, SEEDED.admin);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  function submit(
    fields: Record<string, string> = {},
    cv: Buffer | null = PDF,
    name = 'my cv.pdf',
  ) {
    const req = http().post('/teacher-applications');
    const all = {
      applicantName: 'Bilal Ahmed',
      applicantEmail: uniqueEmail('applicant'),
      subjects: 'Physics, Mathematics',
      captchaToken: 'token-from-widget',
      ...fields,
    };
    for (const [key, value] of Object.entries(all)) req.field(key, value);
    if (cv) req.attach('cv', cv, name);
    return req;
  }

  /** Follows a signed download URL through the app (local storage driver). */
  const download = (url: string) => http().get(new URL(url).pathname);

  describe('public application form (#18, #19)', () => {
    it('accepts an unauthenticated application with a CV, revealing nothing else', async () => {
      const res = await submit().expect(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        status: 'SUBMITTED',
        submittedAt: expect.any(String),
      });
    });

    it('requires a CV of an allowed type, judged by its content', async () => {
      const missing = await submit({}, null).expect(400);
      expect(missing.body.error.info).toEqual({ field: 'cv' });

      const exe = await submit({}, Buffer.from('MZ\x90\x00binary', 'latin1'), 'cv.pdf').expect(400);
      expect(exe.body.error.name).toBe('UPLOAD_REJECTED');
    });

    it('rejects oversize CVs while receiving them', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
      const res = await submit({}, big).expect(413);
      expect(res.body.error.name).toBe('PAYLOAD_TOO_LARGE');
    });

    it('requires the captcha', async () => {
      const res = await submit({ captchaToken: 'invalid-captcha' }).expect(400);
      expect(res.body.error.name).toBe('CAPTCHA_FAILED');
    });
  });

  describe('admin review (#19, #20, #23)', () => {
    it('lists, downloads the CV (audited), reviews, rejects with a purge date, then purges', async () => {
      const email = uniqueEmail('review');
      const { id } = (await submit({ applicantEmail: email }).expect(201)).body.data;

      const list = await http()
        .get(`/admin/teacher-applications?status=SUBMITTED&q=${encodeURIComponent(email)}`)
        .set('Cookie', admin)
        .expect(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.items[0]).toMatchObject({ id, subjects: 'Physics, Mathematics' });

      const cv = await http()
        .get(`/admin/teacher-applications/${id}/cv`)
        .set('Cookie', admin)
        .expect(200);
      const file = await download(cv.body.data.url).expect(200);
      expect(file.body.toString('latin1')).toBe(PDF.toString('latin1'));
      expect(file.headers['content-type']).toContain('application/pdf');
      expect(file.headers['content-disposition']).toContain('Bilal Ahmed CV.pdf');

      const underReview = await http()
        .post(`/admin/teacher-applications/${id}/review`)
        .set('Cookie', admin)
        .send({ status: 'UNDER_REVIEW' })
        .expect(200);
      expect(underReview.body.data).toMatchObject({
        status: 'UNDER_REVIEW',
        reviewedAt: expect.any(String),
        reviewedBy: { email: SEEDED.admin.email },
      });

      const rejected = await http()
        .post(`/admin/teacher-applications/${id}/review`)
        .set('Cookie', admin)
        .send({ status: 'REJECTED', notes: 'No A Level experience yet' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'REJECTED',
        reviewNotes: 'No A Level experience yet',
        purgeAfter: expect.any(String),
      });

      await http()
        .post(`/admin/teacher-applications/${id}/review`)
        .set('Cookie', admin)
        .send({ status: 'HIRED' })
        .expect(409);

      // Retention elapses: the purge removes the row and the CV file.
      await prisma.teacherApplication.update({
        where: { id },
        data: { purgeAfter: new Date('2020-01-01') },
      });
      const purge = await http()
        .post('/admin/teacher-applications/purge')
        .set('Cookie', admin)
        .expect(200);
      expect(purge.body.data.purged).toBeGreaterThanOrEqual(1);
      await http().get(`/admin/teacher-applications/${id}`).set('Cookie', admin).expect(404);
      await download(cv.body.data.url).expect(404);

      const actions = await prisma.auditLog.findMany({
        where: { OR: [{ entityId: id }, { action: 'APPLICATIONS_PURGED' }] },
        select: { action: true },
      });
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'APPLICATION_CV_DOWNLOADED',
          'APPLICATION_REVIEWED',
          'APPLICATIONS_PURGED',
        ]),
      );
    });
  });

  describe('accounts from applications (#21)', () => {
    it('creates the teacher account from an application and links it, hiring the applicant', async () => {
      const email = uniqueEmail('hire');
      const { id } = (await submit({ applicantEmail: email }).expect(201)).body.data;

      const res = await http()
        .post(`/admin/teacher-applications/${id}/account`)
        .set('Cookie', admin)
        .send({})
        .expect(201);
      expect(res.body.data).toMatchObject({
        status: 'HIRED',
        user: { email, fullName: 'Bilal Ahmed' },
      });
      expect(mailbox(app).lastTo(email, 'ACCOUNT_CREATED')).toBeDefined();
    });

    it('links an existing teacher account, but not a non-teacher', async () => {
      const { id } = (await submit().expect(201)).body.data;
      const teacherA = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.teacherA.email },
      });
      const linked = await http()
        .post(`/admin/teacher-applications/${id}/link`)
        .set('Cookie', admin)
        .send({ userId: teacherA.id })
        .expect(200);
      expect(linked.body.data).toMatchObject({ status: 'HIRED', user: { id: teacherA.id } });

      const student = await prisma.user.create({
        data: {
          email: uniqueEmail('student'),
          passwordHash: await hashPassword('irrelevant passphrase'),
          roles: { create: { role: 'STUDENT' } },
        },
      });
      const other = (await submit().expect(201)).body.data;
      await http()
        .post(`/admin/teacher-applications/${other.id}/link`)
        .set('Cookie', admin)
        .send({ userId: student.id })
        .expect(409);
    });
  });

  describe('teacher deactivation (#22)', () => {
    async function newTeacher() {
      const email = uniqueEmail('deact');
      const res = await http()
        .post('/admin/users')
        .set('Cookie', admin)
        .send({ email, fullName: 'Leaving Teacher', roles: ['TEACHER'] })
        .expect(201);
      return { id: res.body.data.id as string, email };
    }

    it('deactivates a teacher with no committed courses', async () => {
      const teacher = await newTeacher();
      const res = await http()
        .post(`/admin/teachers/${teacher.id}/deactivate`)
        .set('Cookie', admin)
        .send({ reason: 'Left the platform' })
        .expect(200);
      expect(res.body.data.status).toBe('DELETED');
    });

    it('refuses while students hold active enrollments in the teacher’s courses', async () => {
      const teacher = await newTeacher();
      await prisma.user.update({
        where: { id: teacher.id },
        data: { passwordHash: await hashPassword('teacher passphrase here') },
      });
      const cookie = await loginAs(app, {
        email: teacher.email,
        password: 'teacher passphrase here',
      });
      const course = await createCourse(app, cookie, await classification(app), 'Committed course');
      const student = await prisma.user.create({
        data: {
          email: uniqueEmail('enrolled'),
          passwordHash: await hashPassword('irrelevant passphrase'),
          roles: { create: { role: 'STUDENT' } },
        },
      });
      await prisma.enrollment.create({
        data: { studentId: student.id, courseId: course.id, source: 'ADMIN_GRANT' },
      });

      const res = await http()
        .post(`/admin/teachers/${teacher.id}/deactivate`)
        .set('Cookie', admin)
        .send({ reason: 'Trying to leave' })
        .expect(409);
      expect(res.body.error.info).toEqual({ committedCourses: 1 });
    });

    it('only applies to teachers', async () => {
      const me = await http().get('/auth/me').set('Cookie', admin).expect(200);
      await http()
        .post(`/admin/teachers/${me.body.data.id}/deactivate`)
        .set('Cookie', admin)
        .send({ reason: 'Not a teacher' })
        .expect(404);
    });
  });
});
