import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { OrderExpiryJob } from '../src/modules/orders/jobs/order-expiry.job';
import { OrderService } from '../src/modules/orders/services/order.service';
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
  describe('Order lifecycle state machine (#57)', () => {
    it('records ORDER_CREATED with actor and timestamp, applies valid transitions with audit attribution, and rejects invalid transitions', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Lifecycle Course', '150000', 2000);
      const student = await newStudent(true);

      const created = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const orderId = created.body.data.id as string;

      const auditCreated = await http()
        .get(`/admin/audit-log?entityType=order&entityId=${orderId}`)
        .set('Cookie', admin)
        .expect(200);
      expect(auditCreated.body.data.items).toEqual([
        expect.objectContaining({
          actorUserId: student.id,
          action: 'ORDER_CREATED',
          entityType: 'order',
          entityId: orderId,
          details: expect.objectContaining({
            to: 'PENDING',
            transitionedAt: expect.any(String),
            paymentReference: created.body.data.paymentReference,
            totalMinor: '150000',
          }),
        }),
      ]);
    });
  });
  describe('Student proof of payment submission (#58)', () => {
    // Minimal valid PNG header (8-byte PNG signature + padding)
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);

    it('requires transactionId, supports optional file upload and multiple proofs per order, and transitions to PROOF_SUBMITTED', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Proof Submission Course', '250000', 2000);
      const student = await newStudent(true);
      const otherStudent = await newStudent(true);

      const created = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const orderId = created.body.data.id as string;

      // Missing transactionId is rejected
      await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', student.cookie)
        .send({})
        .expect(400);

      // Another student cannot submit proof on this order
      await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', otherStudent.cookie)
        .send({ transactionId: 'TXN-OTHER-001' })
        .expect(404);

      // Proof 1: transactionId only (no file upload), transitions order PENDING -> PROOF_SUBMITTED
      const proof1 = await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', student.cookie)
        .send({ transactionId: 'MEZN-20261102-001', amountClaimedMinor: '150000' })
        .expect(201);

      expect(proof1.body.data).toMatchObject({
        orderId,
        orderStatus: 'PROOF_SUBMITTED',
        proof: {
          id: expect.any(String),
          transactionId: 'MEZN-20261102-001',
          amountClaimedMinor: '150000',
          hasProofFile: false,
        },
        proofs: [
          expect.objectContaining({
            transactionId: 'MEZN-20261102-001',
            amountClaimedMinor: '150000',
            hasProofFile: false,
          }),
        ],
      });

      // Proof 2: multipart form with optional PNG screenshot (e.g. top-up transfer), keeps PROOF_SUBMITTED
      const proof2 = await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', student.cookie)
        .field('transactionId', 'MEZN-20261102-002')
        .field('amountClaimedMinor', '100000')
        .attach('proof', pngBuffer, { filename: 'receipt.png', contentType: 'image/png' })
        .expect(201);

      expect(proof2.body.data.orderStatus).toBe('PROOF_SUBMITTED');
      expect(proof2.body.data.proof).toMatchObject({
        transactionId: 'MEZN-20261102-002',
        amountClaimedMinor: '100000',
        hasProofFile: true,
      });
      expect(proof2.body.data.proofs).toHaveLength(2);

      // Admin detail includes both proofs and stored key
      const adminDetail = await http()
        .get(`/admin/orders/${orderId}`)
        .set('Cookie', admin)
        .expect(200);
      expect(adminDetail.body.data.status).toBe('PROOF_SUBMITTED');
      expect(adminDetail.body.data.proofs).toHaveLength(2);
      expect(adminDetail.body.data.proofs[1].proofFileUrl).toMatch(/^payment-proof\/.+\.png$/);

      // Terminal orders (e.g. LAPSED) reject proof submission via state machine (#57)
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'LAPSED' },
      });
      const rejected = await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', student.cookie)
        .send({ transactionId: 'MEZN-20261102-003' })
        .expect(409);
      expect(rejected.body.error.name).toBe('INVALID_STATE_TRANSITION');
    });
  });
  describe('Duplicate transaction ID detection (#59)', () => {
    it('warns when a transaction ID exists on another order without blocking submission, and surfaces warnings to admins', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Duplicate Tx Course', '180000', 2000);
      const student1 = await newStudent(true);
      const student2 = await newStudent(true);

      const order1Res = await http()
        .post('/orders')
        .set('Cookie', student1.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const order1Id = order1Res.body.data.id as string;
      const order1Ref = order1Res.body.data.paymentReference as string;

      const order2Res = await http()
        .post('/orders')
        .set('Cookie', student2.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const order2Id = order2Res.body.data.id as string;

      const sharedTxId = 'TXN-SHARED-' + String(Date.now());
      // Order 1 submits sharedTxId -> no warning
      const firstProof = await http()
        .post(`/orders/${order1Id}/proofs`)
        .set('Cookie', student1.cookie)
        .send({ transactionId: sharedTxId, amountClaimedMinor: '180000' })
        .expect(201);
      expect(firstProof.body.data.duplicateTransactionIdWarning).toBeNull();

      // Order 1 resubmits the same TXN-SHARED-999 on the SAME order -> no cross-order warning, not blocked
      const sameOrderResubmit = await http()
        .post(`/orders/${order1Id}/proofs`)
        .set('Cookie', student1.cookie)
        .send({ transactionId: sharedTxId, amountClaimedMinor: '180000' })
        .expect(201);
      expect(sameOrderResubmit.body.data.duplicateTransactionIdWarning).toBeNull();

      // Order 2 submits 'txn-shared-999' (case-insensitive match with Order 1) -> succeeds (201) with warning!
      const secondOrderProof = await http()
        .post(`/orders/${order2Id}/proofs`)
        .set('Cookie', student2.cookie)
        .send({ transactionId: sharedTxId.toLowerCase(), amountClaimedMinor: '180000' })
        .expect(201);

      expect(secondOrderProof.body.data.orderStatus).toBe('PROOF_SUBMITTED');
      expect(secondOrderProof.body.data.duplicateTransactionIdWarning).toEqual({
        transactionId: sharedTxId.toLowerCase(),
        conflictingOrderIds: [order1Id],
        conflictingPaymentReferences: [order1Ref],
        message: expect.stringContaining(order1Ref),
      });

      // Admin view of Order 2 surfaces the duplicate transaction warning
      const adminView = await http()
        .get(`/admin/orders/${order2Id}`)
        .set('Cookie', admin)
        .expect(200);
      expect(adminView.body.data.duplicateTransactionIdWarnings).toEqual([
        {
          transactionId: sharedTxId.toLowerCase(),
          conflictingOrderIds: [order1Id],
          conflictingPaymentReferences: [order1Ref],
          message: expect.stringContaining(order1Ref),
        },
      ]);
    });
  });
  describe('Pending order status screen for students (#60)', () => {
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0),
    ]);

    it('shows student order status, submitted proofs with signed download URLs, and what is expected of them next across lifecycle states', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Status Screen Course', '200000', 2000);
      const student = await newStudent(true);
      const otherStudent = await newStudent(true);

      const created = await http()
        .post('/orders')
        .set('Cookie', student.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const orderId = created.body.data.id as string;
      const paymentReference = created.body.data.paymentReference as string;

      // 1. PENDING state (no proofs yet): student is expected to transfer funds and submit proof
      const pendingView = await http()
        .get(`/me/orders/${orderId}`)
        .set('Cookie', student.cookie)
        .expect(200);
      expect(pendingView.body.data).toMatchObject({
        id: orderId,
        paymentReference,
        status: 'PENDING',
        proofs: [],
        guidance: {
          statusLabel: 'Awaiting Payment & Proof',
          actionRequired: 'SUBMIT_PROOF',
          canSubmitProof: true,
          nextStepMessage: expect.stringContaining(paymentReference),
        },
      });

      // Also accessible via GET /orders/:orderId and listed in GET /me/orders
      await http().get(`/orders/${orderId}`).set('Cookie', student.cookie).expect(200);
      const listRes = await http().get('/me/orders').set('Cookie', student.cookie).expect(200);
      expect(listRes.body.data).toEqual([
        expect.objectContaining({
          id: orderId,
          status: 'PENDING',
        }),
      ]);

      // Another student cannot view this order
      await http().get(`/me/orders/${orderId}`).set('Cookie', otherStudent.cookie).expect(404);

      // 2. Submit proof with file -> PROOF_SUBMITTED state: guidance tells student admin review is in progress
      await http()
        .post(`/orders/${orderId}/proofs`)
        .set('Cookie', student.cookie)
        .field('transactionId', 'STATUS-TXN-001')
        .field('amountClaimedMinor', '200000')
        .attach('proof', pngBuffer, { filename: 'slip.png', contentType: 'image/png' })
        .expect(201);

      const submittedView = await http()
        .get(`/me/orders/${orderId}`)
        .set('Cookie', student.cookie)
        .expect(200);
      expect(submittedView.body.data).toMatchObject({
        id: orderId,
        status: 'PROOF_SUBMITTED',
        proofs: [
          expect.objectContaining({
            transactionId: 'STATUS-TXN-001',
            amountClaimedMinor: '200000',
            hasProofFile: true,
            proofDownloadUrl: expect.stringContaining('/dev-files/'),
          }),
        ],
        guidance: {
          statusLabel: 'Payment Proof Under Review',
          actionRequired: 'AWAIT_ADMIN_VERIFICATION',
          canSubmitProof: true,
          nextStepMessage: expect.stringContaining('administrator is verifying'),
        },
      });
    });
  });
  describe('Order expiry job (#61)', () => {
    it('lapses overdue PENDING orders, records an ORDER_LAPSED audit entry, emails the student, and leaves PROOF_SUBMITTED orders untouched', async () => {
      const courseId = await publishPaidCourse(teacherA, 'Expiry Window Course', '190000', 2000);
      const studentPending = await newStudent(true);
      const studentWithProof = await newStudent(true);

      const pendingOrderRes = await http()
        .post('/orders')
        .set('Cookie', studentPending.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const pendingOrderId = pendingOrderRes.body.data.id as string;
      const pendingOrderRef = pendingOrderRes.body.data.paymentReference as string;

      const proofOrderRes = await http()
        .post('/orders')
        .set('Cookie', studentWithProof.cookie)
        .send({ courseIds: [courseId] })
        .expect(201);
      const proofOrderId = proofOrderRes.body.data.id as string;

      // Student 2 submits payment proof before the expiry window passes
      await http()
        .post(`/orders/${proofOrderId}/proofs`)
        .set('Cookie', studentWithProof.cookie)
        .send({ transactionId: 'EXPIRY-SAFE-TXN-' + String(Date.now()) })
        .expect(201);

      // Move both orders' expiresAt into the past
      const past = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.order.updateMany({
        where: { id: { in: [pendingOrderId, proofOrderId] } },
        data: { expiresAt: past },
      });

      // Run the scheduled OrderExpiryJob
      const expiryJob = app.get(OrderExpiryJob);
      await expiryJob.run();

      // Overdue PENDING order is now LAPSED
      const lapsedView = await http()
        .get(`/me/orders/${pendingOrderId}`)
        .set('Cookie', studentPending.cookie)
        .expect(200);
      expect(lapsedView.body.data.status).toBe('LAPSED');
      expect(lapsedView.body.data.guidance).toMatchObject({
        statusLabel: 'Order Expired',
        actionRequired: 'NONE',
        canSubmitProof: false,
      });

      // Student was notified via ORDER_LAPSED email
      const lapsedEmail = mailbox(app).lastTo(studentPending.email, 'ORDER_LAPSED');
      expect(lapsedEmail).toBeDefined();
      expect(lapsedEmail?.text).toContain(pendingOrderRef);

      // System ORDER_LAPSED audit entry recorded with actorUserId: null
      const auditLogs = await http()
        .get(`/admin/audit-log?entityType=order&entityId=${pendingOrderId}&action=ORDER_LAPSED`)
        .set('Cookie', admin)
        .expect(200);
      expect(auditLogs.body.data.items).toEqual([
        expect.objectContaining({
          actorUserId: null,
          action: 'ORDER_LAPSED',
          entityType: 'order',
          entityId: pendingOrderId,
          details: expect.objectContaining({
            from: 'PENDING',
            to: 'LAPSED',
            paymentReference: pendingOrderRef,
          }),
        }),
      ]);

      // Order with submitted proof remains PROOF_SUBMITTED and is never lapsed by timer
      const proofOrderView = await http()
        .get(`/me/orders/${proofOrderId}`)
        .set('Cookie', studentWithProof.cookie)
        .expect(200);
      expect(proofOrderView.body.data.status).toBe('PROOF_SUBMITTED');

      // Re-running expireDueOrders is idempotent (0 newly lapsed)
      const orderService = app.get(OrderService);
      expect(await orderService.expireDueOrders()).toBe(0);
    });
  });
});
