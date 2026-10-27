import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { EnrollmentService } from '../src/modules/enrollment/services/enrollment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'student passphrase for enrollment';

describe('Enrollment (#46–#52)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let otherTeacher: string;
  let admin: string;
  let ids: Classification;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    otherTeacher = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function published(title: string, free: boolean) {
    const course = await createCourse(app, teacher, ids, title);
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send(
        free
          ? { isFree: true }
          : { isFree: false, priceMinor: '150000', currency: 'PKR', commissionRateBps: 2000 },
      )
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return course.id as string;
  }

  async function newStudent() {
    const email = uniqueEmail('enrollee');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Hira Student',
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified: true,
        roles: { create: { role: 'STUDENT' } },
      },
    });
    return { id: user.id, email, cookie: await loginAs(app, { email, password: PASSWORD }) };
  }

  describe('free enrollment (#47)', () => {
    it('enrolls any signed-in user in a free course, idempotently, recording source and time (#46)', async () => {
      const courseId = await published('Free enrollment course', true);
      const student = await newStudent();
      const first = await http()
        .post(`/courses/${courseId}/enroll`)
        .set('Cookie', student.cookie)
        .expect(200);
      expect(first.body.data).toMatchObject({
        status: 'ACTIVE',
        source: 'FREE',
        grantedAt: expect.any(String),
        expiresAt: null,
      });
      const again = await http()
        .post(`/courses/${courseId}/enroll`)
        .set('Cookie', student.cookie)
        .expect(200);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(await prisma.enrollment.count({ where: { courseId, studentId: student.id } })).toBe(1);
    });

    it('refuses paid courses, closed enrollment, and the teacher’s own course', async () => {
      const paid = await published('Paid course', false);
      const student = await newStudent();
      const res = await http()
        .post(`/courses/${paid}/enroll`)
        .set('Cookie', student.cookie)
        .expect(409);
      expect(res.body.error).toMatchObject({
        name: 'ENROLLMENT_REFUSED',
        info: { reason: 'PAID_COURSE' },
      });

      const free = await published('Closing course', true);
      await http()
        .put(`/teacher/courses/${free}/enrollment`)
        .set('Cookie', teacher)
        .send({ open: false })
        .expect(200);
      const closed = await http()
        .post(`/courses/${free}/enroll`)
        .set('Cookie', student.cookie)
        .expect(409);
      expect(closed.body.error.info).toEqual({ reason: 'ENROLLMENT_CLOSED' });

      await http().post(`/courses/${free}/enroll`).set('Cookie', teacher).expect(409);
      await http().post(`/courses/${free}/enroll`).expect(401);
    });
  });

  describe('dashboard (#52)', () => {
    it('lists the student’s courses with completion percentage', async () => {
      const courseId = await published('Dashboard course', true);
      const student = await newStudent();
      await http().post(`/courses/${courseId}/enroll`).set('Cookie', student.cookie).expect(200);

      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const sectionId = outline.body.data.sections[0].id;
      // Two more lessons (3 in total), one completed: 33%.
      for (const title of ['Notes A', 'Notes B']) {
        await http()
          .post(`/teacher/courses/${courseId}/sections/${sectionId}/lessons`)
          .set('Cookie', teacher)
          .send({ title, type: 'TEXT', bodyText: 'x' })
          .expect(201);
      }
      await prisma.lessonProgress.create({
        data: {
          studentId: student.id,
          lessonId: outline.body.data.sections[0].lessons[0].id,
          completionSource: 'MANUAL',
        },
      });

      const res = await http().get('/me/enrollments').set('Cookie', student.cookie).expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({
          access: 'ACTIVE',
          totalLessons: 3,
          completedLessons: 1,
          completionPercent: 33,
          course: expect.objectContaining({
            id: courseId,
            teacher: { id: expect.any(String), fullName: 'Teacher A' },
          }),
        }),
      ]);
    });
  });

  describe('teacher view (#50)', () => {
    it('shows a teacher the enrollments of their own course only', async () => {
      const courseId = await published('Roster course', true);
      const student = await newStudent();
      await http().post(`/courses/${courseId}/enroll`).set('Cookie', student.cookie).expect(200);

      const res = await http()
        .get(`/teacher/courses/${courseId}/enrollments`)
        .set('Cookie', teacher)
        .expect(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0]).toMatchObject({
        student: { email: student.email, fullName: 'Hira Student' },
        completionPercent: 0,
      });

      await http()
        .get(`/teacher/courses/${courseId}/enrollments`)
        .set('Cookie', otherTeacher)
        .expect(404);
      await http().get('/admin/enrollments').set('Cookie', teacher).expect(403);
    });
  });

  describe('admin grant and revoke (#49)', () => {
    it('grants against an offline payment with channel and reason, audited; refuses a duplicate', async () => {
      const courseId = await published('Granted course', false);
      const student = await newStudent();
      const res = await http()
        .post('/admin/enrollments')
        .set('Cookie', admin)
        .send({
          studentEmail: student.email.toUpperCase(),
          courseId,
          paymentChannel: 'Bank transfer (offline)',
          reason: 'Paid at the academy desk',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        source: 'ADMIN_GRANT',
        paymentChannel: 'Bank transfer (offline)',
        grantedBy: { fullName: 'Platform Admin' },
      });

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ENROLLMENT_GRANTED', entityId: res.body.data.id },
      });
      expect(audit?.details).toMatchObject({ reason: 'Paid at the academy desk' });

      await http()
        .post('/admin/enrollments')
        .set('Cookie', admin)
        .send({ studentEmail: student.email, courseId, paymentChannel: 'x1', reason: 'again' })
        .expect(409);
    });

    it('revokes access, which the content gate respects; a new grant reactivates the same row', async () => {
      const courseId = await published('Revoked course', true);
      const student = await newStudent();
      const enrolled = await http()
        .post(`/courses/${courseId}/enroll`)
        .set('Cookie', student.cookie)
        .expect(200);
      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const lessonId = outline.body.data.sections[0].lessons[0].id;
      // Make the lesson enrollment-only, so playback reflects the enrollment.
      await prisma.lesson.update({ where: { id: lessonId }, data: { isFreePreview: false } });
      const playback = `/courses/${courseId}/lessons/${lessonId}/playback`;

      await http()
        .post(`/admin/enrollments/${enrolled.body.data.id}/revoke`)
        .set('Cookie', admin)
        .send({ reason: 'Chargeback' })
        .expect(200);
      const denied = await http().get(playback).set('Cookie', student.cookie).expect(403);
      expect(denied.body.error.name).toBe('ENROLLMENT_REQUIRED');

      // A revoked student cannot simply re-enroll for free.
      const refused = await http()
        .post(`/courses/${courseId}/enroll`)
        .set('Cookie', student.cookie)
        .expect(409);
      expect(refused.body.error.info).toEqual({ reason: 'REVOKED' });

      const regrant = await http()
        .post('/admin/enrollments')
        .set('Cookie', admin)
        .send({ studentEmail: student.email, courseId, paymentChannel: 'Cash', reason: 'Resolved' })
        .expect(201);
      expect(regrant.body.data.id).toBe(enrolled.body.data.id);
      expect(regrant.body.data.status).toBe('ACTIVE');
    });
  });

  describe('expiry (#51)', () => {
    it('denies access with a distinct message once expired, and the job marks the row', async () => {
      const courseId = await published('Expiring course', false);
      const student = await newStudent();
      const grant = await http()
        .post('/admin/enrollments')
        .set('Cookie', admin)
        .send({
          studentEmail: student.email,
          courseId,
          paymentChannel: 'Bank',
          reason: 'Term access',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
        .expect(201);
      await prisma.enrollment.update({
        where: { id: grant.body.data.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const lessonId = outline.body.data.sections[0].lessons[0].id;
      const resourcePath = `/courses/${courseId}/lessons/${lessonId}/playback`;
      await prisma.lesson.update({ where: { id: lessonId }, data: { isFreePreview: false } });
      const denied = await http().get(resourcePath).set('Cookie', student.cookie).expect(403);
      expect(denied.body.error.name).toBe('ENROLLMENT_EXPIRED');

      expect(await app.get(EnrollmentService).expireDue()).toBeGreaterThanOrEqual(1);
      const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: grant.body.data.id } });
      expect(row.status).toBe('EXPIRED');
    });
  });
});
