import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { mailbox, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PASSWORD = 'student passphrase for orders';

describe('Orders and Cart (#54, #55, #56)', () => {
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

      const freeRes = await http()
        .post('/orders/cart/preview')
        .set('Cookie', student.cookie)
        .send({ courseIds: [freeCourse] })
        .expect(409);
      expect(freeRes.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'FREE_COURSE', courseId: freeCourse },
      });

      const ownRes = await http()
        .post('/orders/cart/preview')
        .set('Cookie', teacherA)
        .send({ courseIds: [paidCourse] })
        .expect(409);
      expect(ownRes.body.error).toMatchObject({
        name: 'ORDER_REFUSED',
        info: { reason: 'OWN_COURSE', courseId: paidCourse },
      });

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

  describe('POST /orders (#55)', () => {
    it('creates an order with a unique payment reference, returns bank details and amount, and emails instructions', async () => {
      const courseA = await publishPaidCourse(teacherA, 'Order Course A', '150000', 2000);
      const courseB = await publishPaidCourse(teacherB, 'Order Course B', '250000', 1500);
      const student = await newStudent(true);

      const first = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseA, courseB] })
        .expect(201);

      expect(first.body.data).toMatchObject({
        id: expect.any(String),
        paymentReference: expect.stringMatching(/^LMS-\d{8}-[2-9A-HJ-NP-Z]{6}$/),
        status: 'PENDING',
        totalMinor: '400000',
        currency: 'PKR',
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
        verifiedAt: null,
        items: [
          expect.objectContaining({
            courseId: expect.any(String),
            priceMinor: expect.any(String),
            currency: 'PKR',
          }),
          expect.objectContaining({
            courseId: expect.any(String),
            priceMinor: expect.any(String),
            currency: 'PKR',
          }),
        ],
        paymentInstructions: {
          bank: {
            bankName: 'Meezan Bank',
            accountTitle: 'LMS Education Pvt Ltd',
            accountNumber: '01010105432101',
            iban: 'PK36MEZN0001010105432101',
          },
          paymentReference: first.body.data.paymentReference,
          amountMinor: '400000',
          currency: 'PKR',
          expiresAt: first.body.data.expiresAt,
          instructions: expect.stringContaining(first.body.data.paymentReference),
        },
      });

      const second = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseA] })
        .expect(201);
      expect(second.body.data.paymentReference).not.toBe(first.body.data.paymentReference);

      const sent = mailbox(app).lastTo(student.email, 'ORDER_CREATED');
      expect(sent).toBeDefined();
      expect(sent?.text).toContain(second.body.data.paymentReference);
      expect(sent?.text).toContain('PK36MEZN0001010105432101');
    });

    it('requires a verified email address before creating a paid order (#11)', async () => {
      const courseA = await publishPaidCourse(teacherA, 'Verified Only Course', '150000', 2000);
      const unverified = await newStudent(false);

      const res = await http()
        .post('/orders')
        .set('Cookie', unverified.cookie)
        .send({ courseIds: [courseA] })
        .expect(403);
      expect(res.body.error.name).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('Frozen order line snapshots (#56, #31)', () => {
    it('stores frozen price, commission rate, commission amount and net teacher earning at purchase, unaffected by later repricing', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Snapshot Chemistry', '150000', 2000);
      const student1 = await newStudent(true);
      const student2 = await newStudent(true);

      // Order 1 placed at 150,000 minor units, 2000 bps (20% = 30,000 commission, 120,000 net).
      const order1 = await http()
        .post('/orders')
        .set('Cookie', student1.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);

      // Admin changes published course price to 200,000 minor units and commission to 2500 bps (25%).
      await http()
        .put(`/admin/courses/${courseId}/pricing`)
        .set('Cookie', admin)
        .send({ isFree: false, priceMinor: '200000', currency: 'PKR', commissionRateBps: 2500 })
        .expect(200);

      // Order 2 placed after repricing captures the new values.
      const order2 = await http()
        .post('/orders')
        .set('Cookie', student2.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);

      const detail1 = await http()
        .get(`/admin/orders/${order1.body.data.id}`)
        .set('Cookie', admin)
        .expect(200);
      expect(detail1.body.data.totalMinor).toBe('150000');
      expect(detail1.body.data.items).toEqual([
        expect.objectContaining({
          courseId,
          priceMinor: '150000',
          commissionRateBps: 2000,
          commissionMinor: '30000',
          netTeacherMinor: '120000',
        }),
      ]);

      const detail2 = await http()
        .get(`/admin/orders/${order2.body.data.id}`)
        .set('Cookie', admin)
        .expect(200);
      expect(detail2.body.data.totalMinor).toBe('200000');
      expect(detail2.body.data.items).toEqual([
        expect.objectContaining({
          courseId,
          priceMinor: '200000',
          commissionRateBps: 2500,
          commissionMinor: '50000',
          netTeacherMinor: '150000',
        }),
      ]);

      // Non-admin cannot view admin order detail
      await http()
        .get(`/admin/orders/${order1.body.data.id}`)
        .set('Cookie', student1.cookie)
        .expect(403);
    });
  });
});
