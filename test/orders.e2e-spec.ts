import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PAYMENT_REFERENCE_PATTERN } from '../src/modules/orders/domain/order.rules';
import { OrderService } from '../src/modules/orders/services/order.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification } from './utils/courses';
import { mailbox } from './utils/email';
import { orderHelpers, PNG } from './utils/orders';
import { createTestApp } from './utils/test-app';

describe('Orders (#54-#62, #11, #31)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let teacherA: string;
  let teacherB: string;
  let admin: string;
  let h: ReturnType<typeof orderHelpers>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    teacherA = await loginAs(app, SEEDED.teacherA);
    teacherB = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    h = orderHelpers(app, await classification(app), () => admin);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /cart/quote (#54)', () => {
    it('totals courses from different teachers without exposing commission', async () => {
      const a = await h.paidCourse(teacherA, 'Quote A', { priceMinor: '150000' });
      const b = await h.paidCourse(teacherB, 'Quote B', { priceMinor: '275000' });
      const student = await h.newStudent();
      const res = await http()
        .post('/cart/quote')
        .set('Cookie', student.cookie)
        .send({ courseIds: [a, b, a] })
        .expect(200);
      expect(res.body.data).toMatchObject({
        currency: 'PKR',
        totalMinor: '425000',
        teacherCount: 2,
      });
      expect(res.body.data.items.map((i: { courseId: string }) => i.courseId)).toEqual([a, b]);
      expect(JSON.stringify(res.body.data)).not.toMatch(/commission|netTeacher/i);
    });

    it('refuses mixed currencies, free, own, closed and already-owned courses', async () => {
      const pkr = await h.paidCourse(teacherA, 'Quote PKR');
      const usd = await h.paidCourse(teacherA, 'Quote USD', {
        currency: 'USD',
        priceMinor: '5000',
      });
      const free = await h.freeCourse(teacherA, 'Quote free');
      const closed = await h.paidCourse(teacherA, 'Quote closed');
      await http()
        .put(`/teacher/courses/${closed}/enrollment`)
        .set('Cookie', teacherA)
        .send({ open: false })
        .expect(200);
      const student = await h.newStudent();
      const reason = async (courseIds: string[], cookie = student.cookie) => {
        const res = await http()
          .post('/cart/quote')
          .set('Cookie', cookie)
          .send({ courseIds })
          .expect(409);
        expect(res.body.error.name).toBe('ORDER_REFUSED');
        return res.body.error.info.reason;
      };
      expect(await reason([pkr, usd])).toBe('CURRENCY_MISMATCH');
      expect(await reason([free])).toBe('FREE_COURSE');
      expect(await reason([closed])).toBe('ENROLLMENT_CLOSED');
      expect(await reason([pkr], teacherA)).toBe('OWN_COURSE');

      await h.placeOrder(student.cookie, [pkr]);
      expect(await reason([pkr])).toBe('IN_OPEN_ORDER');

      const owned = await h.paidCourse(teacherB, 'Quote owned');
      await prisma.enrollment.create({
        data: { studentId: student.id, courseId: owned, source: 'ADMIN_GRANT' },
      });
      expect(await reason([owned])).toBe('ALREADY_ENROLLED');
    });

    it('refuses a suspended teacher’s course (#22) and unknown ids', async () => {
      const course = await h.paidCourse(teacherA, 'Quote suspended');
      const student = await h.newStudent();
      const teacher = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.teacherA.email },
      });
      await prisma.user.update({ where: { id: teacher.id }, data: { status: 'SUSPENDED' } });
      try {
        const res = await http()
          .post('/cart/quote')
          .set('Cookie', student.cookie)
          .send({ courseIds: [course] })
          .expect(409);
        expect(res.body.error.info.reason).toBe('TEACHER_SUSPENDED');
      } finally {
        await prisma.user.update({ where: { id: teacher.id }, data: { status: 'ACTIVE' } });
      }
      await http()
        .post('/cart/quote')
        .set('Cookie', student.cookie)
        .send({ courseIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(404);
    });

    it('validates the body and requires a session', async () => {
      const student = await h.newStudent();
      await http()
        .post('/cart/quote')
        .set('Cookie', student.cookie)
        .send({ courseIds: [] })
        .expect(400);
      await http().post('/cart/quote').send({ courseIds: [] }).expect(401);
    });
  });

  describe('POST /orders (#55, #56, #11)', () => {
    it('creates a PENDING order with a unique reference, instructions and frozen snapshots', async () => {
      const a = await h.paidCourse(teacherA, 'Order A', {
        priceMinor: '999',
        commissionRateBps: 1250,
      });
      const b = await h.paidCourse(teacherB, 'Order B', {
        priceMinor: '150000',
        commissionRateBps: 2000,
      });
      const student = await h.newStudent();
      const instructions = 'Bank: Test Bank\nIBAN: PK00TEST0000';
      await http()
        .put('/admin/settings/BANK_TRANSFER_INSTRUCTIONS')
        .set('Cookie', admin)
        .send({ value: instructions })
        .expect(200);
      try {
        const before = Date.now();
        const res = await http()
          .post('/orders')
          .set('Cookie', student.cookie)
          .send({ courseIds: [a, b] })
          .expect(201);
        const order = res.body.data;
        expect(order.status).toBe('PENDING');
        expect(order.paymentReference).toMatch(PAYMENT_REFERENCE_PATTERN);
        expect(order.totalMinor).toBe('150999');
        expect(order.paymentInstructions).toMatchObject({
          bankTransferInstructions: instructions,
          paymentReference: order.paymentReference,
          amountMinor: '150999',
          currency: 'PKR',
          verificationTurnaroundHours: 48,
        });
        const hours = (new Date(order.expiresAt).getTime() - before) / 3_600_000;
        expect(hours).toBeGreaterThan(47.9);
        expect(hours).toBeLessThan(48.1);
        expect(order.guidance.nextAction).toBe('SUBMIT_PROOF');

        const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
        const byCourse = new Map(items.map((i) => [i.courseId, i]));
        // 999 x 12.5% = 124.875 -> 125 (half-up)
        expect(byCourse.get(a)).toMatchObject({
          priceMinor: 999n,
          commissionRateBps: 1250,
          commissionMinor: 125n,
          netTeacherMinor: 874n,
        });
        expect(byCourse.get(b)).toMatchObject({
          commissionMinor: 30000n,
          netTeacherMinor: 120000n,
        });

        const email = mailbox(app).lastTo(student.email, 'ORDER_CREATED');
        expect(email?.text).toContain(order.paymentReference);
        expect(email?.text).toContain('IBAN: PK00TEST0000');
        expect(email?.text).toContain('PKR 1,509.99');

        const audit = await prisma.auditLog.findFirst({
          where: { action: 'ORDER_CREATED', entityId: order.id },
        });
        expect(audit?.actorUserId).toBe(student.id);
      } finally {
        await prisma.platformSetting.deleteMany({ where: { key: 'BANK_TRANSFER_INSTRUCTIONS' } });
      }
    });

    it('refuses a student whose email is not verified (#11)', async () => {
      const course = await h.paidCourse(teacherA, 'Unverified buyer');
      const student = await h.newStudent(false);
      const res = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [course] })
        .expect(403);
      expect(res.body.error.name).toBe('EMAIL_NOT_VERIFIED');
      expect(await prisma.order.count({ where: { studentId: student.id } })).toBe(0);
    });

    it('keeps the snapshot after the course is repriced (#31)', async () => {
      const course = await h.paidCourse(teacherA, 'Repriced', {
        priceMinor: '100000',
        commissionRateBps: 2000,
      });
      const first = await h.newStudent();
      const order = await h.placeOrder(first.cookie, [course]);
      await http()
        .put(`/admin/courses/${course}/pricing`)
        .set('Cookie', admin)
        .send({ isFree: false, priceMinor: '250000', currency: 'PKR', commissionRateBps: 3000 })
        .expect(200);

      const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
      expect(item).toMatchObject({
        priceMinor: 100000n,
        commissionRateBps: 2000,
        commissionMinor: 20000n,
        netTeacherMinor: 80000n,
      });
      const view = await http()
        .get(`/me/orders/${order.id}`)
        .set('Cookie', first.cookie)
        .expect(200);
      expect(view.body.data.totalMinor).toBe('100000');

      const second = await h.newStudent();
      const next = await h.placeOrder(second.cookie, [course]);
      expect(next.totalMinor).toBe('250000');
    });
  });

  describe('proofs (#57, #58, #59)', () => {
    it('needs a transaction id, accepts a file and several proofs, and audits each transition', async () => {
      const course = await h.paidCourse(teacherA, 'Proofs');
      const student = await h.newStudent();
      const order = await h.placeOrder(student.cookie, [course]);

      await http()
        .post(`/me/orders/${order.id}/proofs`)
        .set('Cookie', student.cookie)
        .field('amountClaimedMinor', '150000')
        .expect(400);
      await http()
        .post(`/me/orders/${order.id}/proofs`)
        .set('Cookie', student.cookie)
        .field('transactionId', 'TX-BAD-FILE')
        .attach('file', Buffer.from('MZ\x90\x00binary', 'latin1'), 'slip.png')
        .expect(400);

      const first = await http()
        .post(`/me/orders/${order.id}/proofs`)
        .set('Cookie', student.cookie)
        .field('transactionId', `TX-${order.id}-1`)
        .field('amountClaimedMinor', '100000')
        .attach('file', PNG, 'slip.png')
        .expect(201);
      expect(first.body.data.order.status).toBe('PROOF_SUBMITTED');
      expect(first.body.data.proof).toMatchObject({ hasFile: true, amountClaimedMinor: '100000' });
      expect(first.body.data.proof.fileUrl).toEqual(expect.any(String));
      expect(first.body.data.duplicateTransactionIdWarning).toBeNull();
      expect(mailbox(app).lastTo(student.email, 'PAYMENT_PROOF_RECEIVED')).toBeDefined();

      const second = await h.submitProof(student.cookie, order.id, `TX-${order.id}-2`, '50000');
      expect(second.body.data.order.proofs).toHaveLength(2);
      expect(second.body.data.order.status).toBe('PROOF_SUBMITTED');

      const audits = await prisma.auditLog.findMany({
        where: { entityType: 'order', entityId: order.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.map((a) => a.action)).toEqual([
        'ORDER_CREATED',
        'ORDER_PROOF_SUBMITTED',
        'ORDER_PROOF_SUBMITTED',
      ]);
      expect(audits[1]).toMatchObject({
        actorUserId: student.id,
        details: expect.objectContaining({ from: 'PENDING', to: 'PROOF_SUBMITTED' }),
      });
    });

    it('warns about a transaction id already used on another order, without blocking (#59)', async () => {
      const c1 = await h.paidCourse(teacherA, 'Dup 1');
      const c2 = await h.paidCourse(teacherA, 'Dup 2');
      const s1 = await h.newStudent();
      const s2 = await h.newStudent();
      const o1 = await h.placeOrder(s1.cookie, [c1]);
      const o2 = await h.placeOrder(s2.cookie, [c2]);
      const txId = `DUP-${o1.id}`;
      await h.submitProof(s1.cookie, o1.id, txId);
      const res = await h.submitProof(s2.cookie, o2.id, ` ${txId.toLowerCase()} `);
      expect(res.body.data.duplicateTransactionIdWarning).toMatchObject({
        conflictingOrderIds: [o1.id],
        conflictingPaymentReferences: [o1.paymentReference],
      });
      expect(res.body.data.order.status).toBe('PROOF_SUBMITTED');

      const detail = await http().get(`/admin/orders/${o2.id}`).set('Cookie', admin).expect(200);
      expect(detail.body.data.duplicateTransactionIdWarnings).toHaveLength(1);
      expect(detail.body.data.items[0]).toMatchObject({
        commissionMinor: '30000',
        netTeacherMinor: '120000',
      });
    });

    it('refuses proofs on a lapsed order (#57)', async () => {
      const course = await h.paidCourse(teacherA, 'Proof on lapsed');
      const student = await h.newStudent();
      const order = await h.placeOrder(student.cookie, [course]);
      await prisma.order.update({ where: { id: order.id }, data: { status: 'LAPSED' } });
      const res = await http()
        .post(`/me/orders/${order.id}/proofs`)
        .set('Cookie', student.cookie)
        .field('transactionId', 'TX-LAPSED')
        .expect(409);
      expect(res.body.error.name).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('student screens and access control (#60, #62)', () => {
    it('lists and shows only the student’s own orders with what happens next', async () => {
      const course = await h.paidCourse(teacherA, 'Screens');
      const owner = await h.newStudent();
      const other = await h.newStudent();
      const order = await h.placeOrder(owner.cookie, [course]);

      const list = await http().get('/me/orders').set('Cookie', owner.cookie).expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).toEqual([order.id]);
      const detail = await http()
        .get(`/me/orders/${order.id}`)
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(detail.body.data.guidance).toMatchObject({
        statusLabel: 'Awaiting payment',
        canSubmitProof: true,
      });
      expect(detail.body.data.items[0]).toEqual({
        courseId: course,
        courseTitle: 'Screens',
        teacherName: 'Teacher A',
        priceMinor: '150000',
      });

      const otherList = await http().get('/me/orders').set('Cookie', other.cookie).expect(200);
      expect(otherList.body.data).toEqual([]);
      await http().get(`/me/orders/${order.id}`).set('Cookie', other.cookie).expect(404);
      await http().get(`/me/orders/${order.id}/receipt`).set('Cookie', other.cookie).expect(404);
      await http()
        .post(`/me/orders/${order.id}/proofs`)
        .set('Cookie', other.cookie)
        .field('transactionId', 'TX-NOT-MINE')
        .expect(404);
      await http().get(`/me/orders/${order.id}`).expect(401);
      await http().get(`/admin/orders/${order.id}`).set('Cookie', owner.cookie).expect(403);
    });

    it('refuses a receipt until the order is confirmed (#62)', async () => {
      const course = await h.paidCourse(teacherA, 'Receipt early');
      const student = await h.newStudent();
      const order = await h.placeOrder(student.cookie, [course]);
      const pending = await http()
        .get(`/me/orders/${order.id}/receipt`)
        .set('Cookie', student.cookie)
        .expect(409);
      expect(pending.body.error.info.reason).toBe('NOT_VERIFIED');
      await h.submitProof(student.cookie, order.id, `TX-${order.id}`);
      await http().get(`/me/orders/${order.id}/receipt`).set('Cookie', student.cookie).expect(409);
      expect(mailbox(app).lastTo(student.email, 'ORDER_RECEIPT')).toBeUndefined();
    });
  });

  describe('expiry job (#61)', () => {
    it('lapses due PENDING and REJECTED orders, emails the student, and leaves the rest', async () => {
      const course = await h.paidCourse(teacherA, 'Expiry');
      const past = new Date(Date.now() - 60_000);
      const make = async () => {
        const s = await h.newStudent();
        return { s, order: await h.placeOrder(s.cookie, [course]) };
      };
      const pending = await make();
      const rejected = await make();
      const underReview = await make();
      const notDue = await make();
      await prisma.order.update({ where: { id: pending.order.id }, data: { expiresAt: past } });
      await prisma.order.update({
        where: { id: rejected.order.id },
        data: { expiresAt: past, status: 'REJECTED' },
      });
      await h.submitProof(underReview.s.cookie, underReview.order.id, `TX-${underReview.order.id}`);
      await prisma.order.update({ where: { id: underReview.order.id }, data: { expiresAt: past } });

      const lapsed = await app.get(OrderService).expireDueOrders();
      expect(lapsed).toBeGreaterThanOrEqual(2);

      const status = async (id: string) =>
        (await prisma.order.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(pending.order.id)).toBe('LAPSED');
      expect(await status(rejected.order.id)).toBe('LAPSED');
      expect(await status(underReview.order.id)).toBe('PROOF_SUBMITTED');
      expect(await status(notDue.order.id)).toBe('PENDING');

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'ORDER_LAPSED', entityId: pending.order.id },
      });
      expect(audit.actorUserId).toBeNull();
      expect(audit.details).toMatchObject({ from: 'PENDING', to: 'LAPSED' });
      expect(mailbox(app).lastTo(pending.s.email, 'ORDER_LAPSED')?.text).toContain(
        pending.order.paymentReference,
      );

      // A lapsed order frees its course for a new order.
      await h.placeOrder(pending.s.cookie, [course]);
      const view = await http()
        .get(`/me/orders/${pending.order.id}`)
        .set('Cookie', pending.s.cookie)
        .expect(200);
      expect(view.body.data.guidance).toMatchObject({
        statusLabel: 'Expired',
        canSubmitProof: false,
      });
    });
  });
});
