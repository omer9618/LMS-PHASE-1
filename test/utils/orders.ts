import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../../src/modules/auth/services/passwords';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAs } from './auth';
import { Classification, createCourse } from './courses';
import { uniqueEmail } from './email';

const STUDENT_PASSWORD = 'student passphrase for orders';

/** A minimal valid PNG header: enough for the upload policy's type sniffing. */
export const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

/** Orders and verification e2e helpers (#54-#67). */
export function orderHelpers(
  app: NestExpressApplication,
  ids: Classification,
  adminCookie: () => string,
) {
  const http = () => request(app.getHttpServer());
  const prisma = app.get(PrismaService);

  /** A published, priced course of the given teacher. */
  async function paidCourse(
    teacherCookie: string,
    title: string,
    pricing: { priceMinor?: string; currency?: string; commissionRateBps?: number } = {},
  ): Promise<string> {
    const course = await createCourse(app, teacherCookie, ids, title);
    await http()
      .post(`/teacher/courses/${course.id}/submit`)
      .set('Cookie', teacherCookie)
      .expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', adminCookie())
      .send({
        isFree: false,
        priceMinor: pricing.priceMinor ?? '150000',
        currency: pricing.currency ?? 'PKR',
        commissionRateBps: pricing.commissionRateBps ?? 2000,
      })
      .expect(200);
    await http()
      .post(`/admin/courses/${course.id}/approve`)
      .set('Cookie', adminCookie())
      .expect(200);
    return course.id;
  }

  async function freeCourse(teacherCookie: string, title: string): Promise<string> {
    const course = await createCourse(app, teacherCookie, ids, title);
    await http()
      .post(`/teacher/courses/${course.id}/submit`)
      .set('Cookie', teacherCookie)
      .expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', adminCookie())
      .send({ isFree: true })
      .expect(200);
    await http()
      .post(`/admin/courses/${course.id}/approve`)
      .set('Cookie', adminCookie())
      .expect(200);
    return course.id;
  }

  async function newStudent(isEmailVerified = true) {
    const email = uniqueEmail('buyer');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Zain Buyer',
        passwordHash: await hashPassword(STUDENT_PASSWORD),
        isEmailVerified,
        roles: { create: { role: 'STUDENT' } },
      },
    });
    return {
      id: user.id,
      email,
      cookie: await loginAs(app, { email, password: STUDENT_PASSWORD }),
    };
  }

  /** Places an order and returns its id and reference. */
  async function placeOrder(cookie: string, courseIds: string[]) {
    const res = await http().post('/orders').set('Cookie', cookie).send({ courseIds }).expect(201);
    return res.body.data as { id: string; paymentReference: string; totalMinor: string };
  }

  async function submitProof(
    cookie: string,
    orderId: string,
    transactionId: string,
    amountClaimedMinor?: string,
  ) {
    const req = http()
      .post(`/me/orders/${orderId}/proofs`)
      .set('Cookie', cookie)
      .field('transactionId', transactionId);
    if (amountClaimedMinor) req.field('amountClaimedMinor', amountClaimedMinor);
    return req.expect(201);
  }

  return { paidCourse, freeCourse, newStudent, placeOrder, submitProof };
}
