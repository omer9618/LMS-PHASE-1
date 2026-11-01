import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'student passphrase for orders';

describe('Orders and Cart (#54)', () => {
  let app: NestExpressApplication;
  let teacherA: string;
  let teacherB: string;
  let admin: string;
  let ids: Classification;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacherA = await loginAs(app, SEEDED.teacherA);
    teacherB = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function publishPaidCourse(
    teacherCookie: string,
    title: string,
    priceMinor = '150000',
    commissionRateBps = 2000,
    currency = 'PKR',
  ) {
    const course = await createCourse(app, teacherCookie, ids, title);
    await http()
      .post(`/teacher/courses/${course.id}/submit`)
      .set('Cookie', teacherCookie)
      .expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: false, priceMinor, currency, commissionRateBps })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return course.id;
  }

  async function publishFreeCourse(teacherCookie: string, title: string) {
    const course = await createCourse(app, teacherCookie, ids, title);
    await http()
      .post(`/teacher/courses/${course.id}/submit`)
      .set('Cookie', teacherCookie)
      .expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return course.id;
  }

  async function newStudent(isEmailVerified = true) {
    const email = uniqueEmail('buyer');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Zain Buyer',
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified,
        roles: { create: { role: 'STUDENT' } },
      },
    });
    return { id: user.id, email, cookie: await loginAs(app, { email, password: PASSWORD }) };
  }

  describe('POST /orders/cart/preview (#54)', () => {
    it('computes totals across courses from different teachers and never leaks commission fields', async () => {
      const courseA = await publishPaidCourse(teacherA, 'Teacher A Chemistry', '150000', 2000);
      const courseB = await publishPaidCourse(teacherB, 'Teacher B Maths', '275000', 1500);
      const student = await newStudent();

      const res = await http()
        .post('/orders/cart/preview')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseA, courseB, courseA] })
        .expect(200);

      expect(res.body.data).toEqual({
        currency: 'PKR',
        totalMinor: '425000',
        teacherCount: 2,
        items: [
          {
            courseId: courseA,
            title: 'Teacher A Chemistry',
            teacherId: expect.any(String),
            teacherName: 'Teacher A',
            priceMinor: '150000',
            currency: 'PKR',
          },
          {
            courseId: courseB,
            title: 'Teacher B Maths',
            teacherId: expect.any(String),
            teacherName: 'Teacher B',
            priceMinor: '275000',
            currency: 'PKR',
          },
        ],
      });
      expect(res.body.data.items[0].teacherId).not.toBe(res.body.data.items[1].teacherId);
      expect(res.body.data.items[0]).not.toHaveProperty('commissionRateBps');
      expect(res.body.data.items[0]).not.toHaveProperty('commissionMinor');
      expect(res.body.data.items[0]).not.toHaveProperty('netTeacherMinor');
    });

    it('refuses free courses, own courses, closed enrollment, and already-enrolled courses', async () => {
      const freeCourse = await publishFreeCourse(teacherA, 'Free Chemistry Demo');
      const paidCourse = await publishPaidCourse(teacherA, 'Paid Chemistry Full', '180000', 2000);
      const student = await newStudent();

      // Free course in cart -> refused
      const freeRes = await http()
        .post('/orders/cart/preview')
        .set('Cookie', student.cookie)
        .send({ courseIds: [freeCourse] })
        .expect(409);
      expect(freeRes.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'FREE_COURSE', courseId: freeCourse },
      });

      // Teacher buying own course -> refused
      const ownRes = await http()
        .post('/orders/cart/preview')
        .set('Cookie', teacherA)
        .send({ courseIds: [paidCourse] })
        .expect(409);
      expect(ownRes.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'OWN_COURSE', courseId: paidCourse },
      });

      // Student already actively enrolled -> refused
      await http()
        .post('/admin/enrollments')
        .set('Cookie', admin)
        .send({
          studentEmail: student.email,
          courseId: paidCourse,
          paymentChannel: 'CASH',
          reason: 'Offline payment',
        })
        .expect(201);

      const enrolledRes = await http()
        .post('/orders/cart/preview')
        .set('Cookie', student.cookie)
        .send({ courseIds: [paidCourse] })
        .expect(409);
      expect(enrolledRes.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'ALREADY_ENROLLED', courseId: paidCourse },
      });
    });

    it('refuses mixed currencies in the same cart', async () => {
      const pkrCourse = await publishPaidCourse(teacherA, 'PKR Course', '150000', 2000, 'PKR');
      const usdCourse = await publishPaidCourse(teacherB, 'USD Course', '5000', 2000, 'USD');
      const student = await newStudent();

      const res = await http()
        .post('/orders/cart/preview')
        .set('Cookie', student.cookie)
        .send({ courseIds: [pkrCourse, usdCourse] })
        .expect(409);
      expect(res.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'CURRENCY_MISMATCH', expected: 'PKR', actual: 'USD' },
      });
    });
  });
});
