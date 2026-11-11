import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification } from './utils/courses';
import { mailbox } from './utils/email';
import { orderHelpers } from './utils/orders';
import { createTestApp } from './utils/test-app';

const today = () => new Date().toISOString().slice(0, 10);

describe('Payment verification (#63-#67, #48, #80, #112)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let teacherA: string;
  let teacherB: string;
  let admin: string;
  let teacherAId: string;
  let teacherBId: string;
  let h: ReturnType<typeof orderHelpers>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    teacherA = await loginAs(app, SEEDED.teacherA);
    teacherB = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    h = orderHelpers(app, await classification(app), () => admin);
    teacherAId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherA.email } }))
      .id;
    teacherBId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherB.email } }))
      .id;
    // The queue is global and oldest-first: clear orders left under review by earlier runs.
    await prisma.order.updateMany({
      where: { status: 'PROOF_SUBMITTED' },
      data: { status: 'LAPSED' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const queue = async () =>
    (await http().get('/admin/verification/queue?limit=200').set('Cookie', admin).expect(200)).body
      .data;
  const entryFor = async (orderId: string) =>
    (await queue()).items.find((e: { orderId: string }) => e.orderId === orderId);
  const confirm = (orderId: string, body: Record<string, unknown>) =>
    http().post(`/admin/verification/orders/${orderId}/confirm`).set('Cookie', admin).send(body);
  const reject = (orderId: string, body: Record<string, unknown>) =>
    http().post(`/admin/verification/orders/${orderId}/reject`).set('Cookie', admin).send(body);

  it('runs the whole loop: quote, order, proof, queue, confirm, enrollment, ledger, receipt, emails', async () => {
    const a = await h.paidCourse(teacherA, 'Loop A', {
      priceMinor: '150000',
      commissionRateBps: 2000,
    });
    const b = await h.paidCourse(teacherB, 'Loop B', {
      priceMinor: '99999',
      commissionRateBps: 1250,
    });
    const student = await h.newStudent();

    const quote = await http()
      .post('/cart/quote')
      .set('Cookie', student.cookie)
      .send({ courseIds: [a, b] })
      .expect(200);
    expect(quote.body.data.totalMinor).toBe('249999');
    const order = await h.placeOrder(student.cookie, [a, b]);
    await h.submitProof(student.cookie, order.id, `LOOP-${order.id}`, '249999');

    // Not enrolled, no earnings, no receipt before confirmation (#48, #62).
    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(0);

    const entry = await entryFor(order.id);
    expect(entry).toMatchObject({
      paymentReference: order.paymentReference,
      totalMinor: '249999',
      claimed: { claimedMinor: '249999', differenceMinor: '0', mismatch: false },
      duplicateTransactionIdWarnings: [],
      overTurnaround: false,
    });
    expect(entry.waitingMinutes).toBeGreaterThanOrEqual(0);
    expect(entry.proofs).toHaveLength(1);

    const res = await confirm(order.id, {
      amountReceivedMinor: '249999',
      valueDate: today(),
    }).expect(200);
    expect(res.body.data).toMatchObject({
      status: 'VERIFIED',
      outcome: 'CONFIRMED',
      differenceMinor: '0',
      enrollmentsGranted: 2,
      ledgerEntriesWritten: 2,
    });

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('VERIFIED');
    expect(stored.verifiedAt).not.toBeNull();

    const verification = await prisma.paymentVerification.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(verification).toMatchObject({
      outcome: 'CONFIRMED',
      amountReceivedMinor: 249999n,
      mismatchAction: null,
    });
    expect(verification.valueDate?.toISOString().slice(0, 10)).toBe(today());

    const enrollments = await prisma.enrollment.findMany({ where: { studentId: student.id } });
    expect(enrollments).toHaveLength(2);
    for (const e of enrollments) {
      expect(e).toMatchObject({
        status: 'ACTIVE',
        source: 'PURCHASE',
        orderItemId: expect.any(String),
      });
    }

    const ledger = await prisma.teacherLedger.findMany({
      where: { orderItem: { orderId: order.id } },
      orderBy: { amountMinor: 'asc' },
    });
    // 99999 x 12.5% = 12499.875 -> 12500 commission; 150000 x 20% = 30000.
    expect(ledger.map((l) => [l.teacherId, l.type, l.amountMinor, l.currency])).toEqual([
      [teacherBId, 'EARNING', 87499n, 'PKR'],
      [teacherAId, 'EARNING', 120000n, 'PKR'],
    ]);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ORDER_VERIFIED', entityId: order.id },
    });
    expect(audit.details).toMatchObject({
      from: 'PROOF_SUBMITTED',
      to: 'VERIFIED',
      amountReceivedMinor: '249999',
      valueDate: today(),
      enrollmentsGranted: 2,
      ledgerEntriesWritten: 2,
    });
    expect(audit.actorUserId).not.toBeNull();

    const mail = mailbox(app);
    expect(mail.lastTo(student.email, 'PAYMENT_CONFIRMED')?.text).toContain('PKR 2,499.99');
    expect(mail.lastTo(student.email, 'ORDER_RECEIPT')?.text).toContain('Loop B');
    expect(mail.lastTo(student.email, 'ENROLLMENT_GRANTED')?.text).toContain('Loop A');

    const receipt = await http()
      .get(`/me/orders/${order.id}/receipt`)
      .set('Cookie', student.cookie)
      .expect(200);
    expect(receipt.body.data).toMatchObject({ totalMinor: '249999', currency: 'PKR' });
    expect(receipt.body.data.receiptNumber).toBe(`RCT-${order.paymentReference.slice(4)}`);

    // Content gate now lets the student in; the order is no longer in the queue.
    expect(await entryFor(order.id)).toBeUndefined();

    // Confirming twice is refused and writes nothing more (#48 idempotent).
    await confirm(order.id, { amountReceivedMinor: '249999', valueDate: today() }).expect(409);
    expect(await prisma.teacherLedger.count({ where: { orderItem: { orderId: order.id } } })).toBe(
      2,
    );
    // Owned now: a new order for the same course is refused.
    const again = await http()
      .post('/cart/quote')
      .set('Cookie', student.cookie)
      .send({ courseIds: [a] })
      .expect(409);
    expect(again.body.error.info.reason).toBe('ALREADY_ENROLLED');
  });

  it('rejects with a reason, emails it, and accepts a resubmission on the same order (#65)', async () => {
    const course = await h.paidCourse(teacherA, 'Reject me');
    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [course]);
    await h.submitProof(student.cookie, order.id, `WRONG-${order.id}`);

    await reject(order.id, {}).expect(400);
    await reject(order.id, { rejectionReason: 'NOT_A_REASON' }).expect(400);
    const noNotes = await reject(order.id, { rejectionReason: 'OTHER' }).expect(422);
    expect(noNotes.body.error.info.reason).toBe('NOTES_REQUIRED');

    const before = Date.now();
    const res = await reject(order.id, {
      rejectionReason: 'INVALID_TRANSACTION_ID',
      notes: 'No transfer with this ID',
    }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'REJECTED', outcome: 'REJECTED' });

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('REJECTED');
    // The expiry clock restarted.
    expect(stored.expiresAt!.getTime()).toBeGreaterThan(before + 47 * 3_600_000);

    const email = mailbox(app).lastTo(student.email, 'PAYMENT_REJECTED');
    expect(email?.text).toContain('The transaction ID could not be matched to a transfer');
    expect(email?.text).toContain('No transfer with this ID');

    const view = await http()
      .get(`/me/orders/${order.id}`)
      .set('Cookie', student.cookie)
      .expect(200);
    expect(view.body.data.lastDecision).toMatchObject({ kind: 'REJECTED' });
    expect(view.body.data.guidance).toMatchObject({
      canSubmitProof: true,
      nextAction: 'SUBMIT_PROOF',
    });
    expect(await entryFor(order.id)).toBeUndefined();

    await h.submitProof(student.cookie, order.id, `RIGHT-${order.id}`, '150000');
    const entry = await entryFor(order.id);
    // Only the new round's proof is shown.
    expect(entry.proofs.map((p: { transactionId: string }) => p.transactionId)).toEqual([
      `RIGHT-${order.id}`,
    ]);
    await confirm(order.id, { amountReceivedMinor: '150000', valueDate: today() }).expect(200);
    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(1);
  });

  it('handles amount mismatches: difference shown, top-up, confirm anyway, reject (#66)', async () => {
    const course = await h.paidCourse(teacherA, 'Mismatch', { priceMinor: '100000' });

    // Short payment: action required, then top-up.
    const s1 = await h.newStudent();
    const o1 = await h.placeOrder(s1.cookie, [course]);
    await h.submitProof(s1.cookie, o1.id, `PART-${o1.id}`, '40000');
    expect((await entryFor(o1.id)).claimed).toEqual({
      claimedMinor: '40000',
      differenceMinor: '-60000',
      mismatch: true,
    });
    const required = await confirm(o1.id, {
      amountReceivedMinor: '40000',
      valueDate: today(),
    }).expect(422);
    expect(required.body.error.info).toMatchObject({
      reason: 'MISMATCH_ACTION_REQUIRED',
      differenceMinor: '-60000',
    });
    const topUp = await confirm(o1.id, {
      amountReceivedMinor: '40000',
      valueDate: today(),
      mismatchAction: 'REQUEST_TOP_UP',
    }).expect(200);
    expect(topUp.body.data).toMatchObject({ status: 'PENDING', differenceMinor: '-60000' });
    expect(mailbox(app).lastTo(s1.email, 'PAYMENT_TOP_UP_REQUESTED')?.text).toContain('PKR 600.00');
    const view = await http().get(`/me/orders/${o1.id}`).set('Cookie', s1.cookie).expect(200);
    expect(view.body.data.guidance.statusLabel).toBe('Top-up required');
    expect(view.body.data.lastDecision).toEqual({
      kind: 'TOP_UP_REQUESTED',
      shortfallMinor: '60000',
    });
    expect(await prisma.enrollment.count({ where: { studentId: s1.id } })).toBe(0);

    await h.submitProof(s1.cookie, o1.id, `REST-${o1.id}`, '60000');
    const entry = await entryFor(o1.id);
    expect(entry.previouslyReceivedMinor).toBe('40000');
    expect(entry.claimed).toMatchObject({ claimedMinor: '100000', mismatch: false });
    await confirm(o1.id, { amountReceivedMinor: '100000', valueDate: today() }).expect(200);
    expect(await prisma.enrollment.count({ where: { studentId: s1.id, status: 'ACTIVE' } })).toBe(
      1,
    );

    // Overpaid: a top-up makes no sense; confirm anyway works.
    const s2 = await h.newStudent();
    const o2 = await h.placeOrder(s2.cookie, [course]);
    await h.submitProof(s2.cookie, o2.id, `OVER-${o2.id}`);
    const notShort = await confirm(o2.id, {
      amountReceivedMinor: '110000',
      valueDate: today(),
      mismatchAction: 'REQUEST_TOP_UP',
    }).expect(422);
    expect(notShort.body.error.info.reason).toBe('NOT_SHORT');
    const anyway = await confirm(o2.id, {
      amountReceivedMinor: '110000',
      valueDate: today(),
      mismatchAction: 'CONFIRM_ANYWAY',
    }).expect(200);
    expect(anyway.body.data).toMatchObject({
      status: 'VERIFIED',
      differenceMinor: '10000',
      mismatchAction: 'CONFIRM_ANYWAY',
    });

    // Short and rejected.
    const s3 = await h.newStudent();
    const o3 = await h.placeOrder(s3.cookie, [course]);
    await h.submitProof(s3.cookie, o3.id, `SHORT-${o3.id}`);
    const rejected = await confirm(o3.id, {
      amountReceivedMinor: '1000',
      valueDate: today(),
      mismatchAction: 'REJECT',
    }).expect(200);
    expect(rejected.body.data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'AMOUNT_SHORT',
    });
    expect(mailbox(app).lastTo(s3.email, 'PAYMENT_REJECTED')?.text).toContain(
      'less than the order total',
    );
    expect(await prisma.teacherLedger.count({ where: { orderItem: { orderId: o3.id } } })).toBe(0);
  });

  it('validates the amount and value date (#64)', async () => {
    const course = await h.paidCourse(teacherA, 'Validation');
    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [course]);
    await h.submitProof(student.cookie, order.id, `VAL-${order.id}`);
    await confirm(order.id, { valueDate: today() }).expect(400);
    await confirm(order.id, { amountReceivedMinor: '150000' }).expect(400);
    await confirm(order.id, { amountReceivedMinor: 150000, valueDate: today() }).expect(400);
    await confirm(order.id, { amountReceivedMinor: '150000', valueDate: '02/11/2026' }).expect(400);
    const future = await confirm(order.id, {
      amountReceivedMinor: '150000',
      valueDate: '2999-01-01',
    }).expect(422);
    expect(future.body.error.info.reason).toBe('VALUE_DATE_IN_FUTURE');
    expect(await prisma.paymentVerification.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('still grants a course whose enrollment closed after the order was placed', async () => {
    const course = await h.paidCourse(teacherB, 'Closed later');
    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [course]);
    await h.submitProof(student.cookie, order.id, `CLOSED-${order.id}`);
    await http()
      .put(`/teacher/courses/${course}/enrollment`)
      .set('Cookie', teacherB)
      .send({ open: false })
      .expect(200);
    await confirm(order.id, { amountReceivedMinor: '150000', valueDate: today() }).expect(200);
    expect(
      await prisma.enrollment.findFirst({ where: { studentId: student.id, courseId: course } }),
    ).toMatchObject({ status: 'ACTIVE', source: 'PURCHASE' });
  });

  it('flags duplicate transaction ids in the queue (#59, #63)', async () => {
    const course = await h.paidCourse(teacherA, 'Queue duplicates');
    const s1 = await h.newStudent();
    const s2 = await h.newStudent();
    const o1 = await h.placeOrder(s1.cookie, [course]);
    const o2 = await h.placeOrder(s2.cookie, [course]);
    await h.submitProof(s1.cookie, o1.id, `SAME-${o1.id}`);
    await h.submitProof(s2.cookie, o2.id, `SAME-${o1.id}`);
    const e1 = await entryFor(o1.id);
    const e2 = await entryFor(o2.id);
    expect(e1.duplicateTransactionIdWarnings[0].conflictingOrderIds).toEqual([o2.id]);
    expect(e2.duplicateTransactionIdWarnings[0].conflictingOrderIds).toEqual([o1.id]);
    // Oldest first.
    const ids = (await queue()).items.map((e: { orderId: string }) => e.orderId);
    expect(ids.indexOf(o1.id)).toBeLessThan(ids.indexOf(o2.id));
  });

  it('cuts the queue into pages in the database: oldest first, a true total, a resubmitted order at the back', async () => {
    // The queue is global: start this check from an empty one.
    await prisma.order.updateMany({
      where: { status: 'PROOF_SUBMITTED' },
      data: { status: 'LAPSED' },
    });
    const course = await h.paidCourse(teacherA, 'Queue paging');
    const placed: Array<{ id: string; cookie: string }> = [];
    for (const hoursAgo of [5, 4, 3, 2]) {
      const student = await h.newStudent();
      const order = await h.placeOrder(student.cookie, [course]);
      await h.submitProof(student.cookie, order.id, `PAGE-${order.id}`);
      await prisma.paymentProof.updateMany({
        where: { orderId: order.id },
        data: { submittedAt: new Date(Date.now() - hoursAgo * 3_600_000) },
      });
      placed.push({ id: order.id, cookie: student.cookie });
    }
    const [o1, o2, o3, o4] = placed.map((p) => p.id);
    const page = async (limit: number, offset: number) =>
      (
        await http()
          .get(`/admin/verification/queue?limit=${limit}&offset=${offset}`)
          .set('Cookie', admin)
          .expect(200)
      ).body.data;
    const idsOf = (data: { items: Array<{ orderId: string }> }) => data.items.map((e) => e.orderId);

    const first = await page(2, 0);
    expect(idsOf(first)).toEqual([o1, o2]);
    expect(first).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(first.items[0].waitingMinutes).toBeGreaterThanOrEqual(5 * 60 - 1);
    expect(idsOf(await page(2, 2))).toEqual([o3, o4]);
    expect(await page(2, 4)).toMatchObject({ items: [], total: 4 });

    // A rejected order that is sent again starts waiting from its new proof: back of the queue.
    await reject(o1, { rejectionReason: 'INVALID_TRANSACTION_ID', notes: 'Not found' }).expect(200);
    expect(idsOf(await page(10, 0))).toEqual([o2, o3, o4]);
    await h.submitProof(placed[0].cookie, o1, `AGAIN-${o1}`);
    const again = await page(10, 0);
    expect(idsOf(again)).toEqual([o2, o3, o4, o1]);
    expect(again.total).toBe(4);
    expect(again.items[3].waitingMinutes).toBeLessThan(5);

    // The metrics agree with the queue.
    const metrics = (
      await http().get('/admin/verification/metrics').set('Cookie', admin).expect(200)
    ).body.data;
    expect(metrics.queueSize).toBe(4);
    expect(metrics.oldestWaitingMinutes).toBeGreaterThanOrEqual(4 * 60 - 1);
    expect(metrics.oldestWaitingMinutes).toBeLessThan(4 * 60 + 5);
  });

  it('reports metrics against the turnaround setting (#67)', async () => {
    const course = await h.paidCourse(teacherA, 'Metrics');
    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [course]);
    await h.submitProof(student.cookie, order.id, `OLD-${order.id}`);
    const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000);
    await prisma.paymentProof.updateMany({
      where: { orderId: order.id },
      data: { submittedAt: threeDaysAgo },
    });

    const res = await http().get('/admin/verification/metrics').set('Cookie', admin).expect(200);
    expect(res.body.data).toMatchObject({
      turnaroundHours: 48,
      oldestOverTurnaround: true,
    });
    expect(res.body.data.queueSize).toBeGreaterThanOrEqual(1);
    expect(res.body.data.overTurnaroundCount).toBeGreaterThanOrEqual(1);
    expect(new Date(res.body.data.oldestWaitingSince).getTime()).toBeLessThanOrEqual(
      threeDaysAgo.getTime(),
    );
    expect(res.body.data.oldestWaitingMinutes).toBeGreaterThanOrEqual(72 * 60 - 1);

    const first = (await queue()).items[0];
    expect(first.orderId).toBe(order.id);
    expect(first.overTurnaround).toBe(true);
  });

  it('is admin-only', async () => {
    const student = await h.newStudent();
    const id = '00000000-0000-4000-8000-000000000000';
    for (const cookie of [student.cookie, teacherA]) {
      await http().get('/admin/verification/queue').set('Cookie', cookie).expect(403);
      await http().get('/admin/verification/metrics').set('Cookie', cookie).expect(403);
      await http()
        .post(`/admin/verification/orders/${id}/confirm`)
        .set('Cookie', cookie)
        .send({ amountReceivedMinor: '1', valueDate: today() })
        .expect(403);
      await http()
        .post(`/admin/verification/orders/${id}/reject`)
        .set('Cookie', cookie)
        .send({ rejectionReason: 'OTHER', notes: 'x' })
        .expect(403);
    }
    await http().get('/admin/verification/queue').expect(401);
    await confirm(id, { amountReceivedMinor: '1', valueDate: today() }).expect(404);
  });
});
