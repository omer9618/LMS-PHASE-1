import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PayoutService } from '../src/modules/payouts/services/payout.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification } from './utils/courses';
import { mailbox } from './utils/email';
import { orderHelpers } from './utils/orders';
import { createTestApp } from './utils/test-app';

const today = () => new Date().toISOString().slice(0, 10);

describe('Teacher Payouts, Notifications, Dispute Window & Concerns (#85-#89, #113)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let payoutService: PayoutService;
  let teacherA: string;
  let teacherB: string;
  let admin: string;
  let adminId: string;
  let teacherAId: string;
  let h: ReturnType<typeof orderHelpers>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    payoutService = app.get(PayoutService);
    teacherA = await loginAs(app, SEEDED.teacherA);
    teacherB = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    h = orderHelpers(app, await classification(app), () => admin);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.admin.email } })).id;
    teacherAId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherA.email } }))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  const confirm = (orderId: string, amountReceivedMinor: string) =>
    http()
      .post(`/admin/verification/orders/${orderId}/confirm`)
      .set('Cookie', admin)
      .send({ amountReceivedMinor, valueDate: today() });

  it('#85, #86, #113: records payout, creates negative PAYOUT ledger entry, captures covered sales, and emails teacher with itemised coverage', async () => {
    await prisma.payoutDispute.deleteMany({ where: { teacherId: teacherAId } });
    await prisma.teacherLedger.deleteMany({ where: { teacherId: teacherAId } });
    await prisma.payout.deleteMany({ where: { teacherId: teacherAId } });

    const courseA = await h.paidCourse(teacherA, 'Payout Chem A', {
      priceMinor: '200000',
      commissionRateBps: 2000, // net teacher = 160,000
    });

    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [courseA]);
    await h.submitProof(student.cookie, order.id, `TX-PAY-${order.id}`, '200000');
    await confirm(order.id, '200000').expect(200);

    // Refuses payout exceeding teacher balance (160,000)
    await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '160001',
        currency: 'PKR',
        transactionId: 'HBL-OVER-001',
        transferDate: today(),
      })
      .expect(409);

    const txId = `HBL-PAY-${Date.now()}`;
    const res = await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '100000',
        currency: 'PKR',
        method: 'BANK_TRANSFER',
        transactionId: txId,
        transferDate: today(),
        periodStart: today(),
        periodEnd: today(),
      })
      .expect(201);

    expect(res.body.data.payout).toMatchObject({
      teacherId: teacherAId,
      amountMinor: '100000',
      method: 'BANK_TRANSFER',
      transactionId: txId,
      status: 'PENDING',
      recordedById: adminId,
    });
    expect(res.body.data.ledgerEntry).toMatchObject({
      teacherId: teacherAId,
      type: 'PAYOUT',
      amountMinor: '-100000',
      currency: 'PKR',
      payoutId: res.body.data.payout.id,
      createdById: adminId,
    });
    expect(res.body.data.remainingBalance).toMatchObject({
      currency: 'PKR',
      balanceMinor: '60000',
      earningsMinor: '160000',
      payoutsMinor: '-100000',
    });
    expect(res.body.data.coveredSales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: order.id,
          courseId: courseA,
          netTeacherMinor: '160000',
        }),
      ]),
    );

    // #86 & #113: Teacher received PAYOUT_RECORDED email with amount, txId, date, and itemised sales coverage
    const mail = mailbox(app).lastTo(SEEDED.teacherA.email, 'PAYOUT_RECORDED');
    expect(mail).toBeDefined();
    expect(mail!.subject).toContain('PKR 1,000.00');
    expect(mail!.subject).toContain(txId);
    expect(mail!.text).toContain(txId);
    expect(mail!.text).toContain('Payout Chem A');
    expect(mail!.text).toContain('PKR 1,600.00');

    // Teacher can view their own payout, and Teacher B gets 404 (#14)
    const payoutId = res.body.data.payout.id as string;
    const myPayout = await http()
      .get(`/teacher/payouts/${payoutId}`)
      .set('Cookie', teacherA)
      .expect(200);
    expect(myPayout.body.data.payout.id).toBe(payoutId);

    await http().get(`/teacher/payouts/${payoutId}`).set('Cookie', teacherB).expect(404);
  });

  it('#87, #88, #89: enforces 7-day dispute window, auto-accepts overdue PENDING payouts while skipping DISPUTED ones, and resolves concerns with optional adjustment', async () => {
    // Give teacherA additional balance via adjustment so we can create two payouts
    await http()
      .post(`/admin/teachers/${teacherAId}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '200000',
        currency: 'PKR',
        reason: 'Top-up for dispute window test',
      })
      .expect(201);

    const p1Res = await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '50000',
        currency: 'PKR',
        transactionId: `HBL-P1-${Date.now()}`,
        transferDate: today(),
      })
      .expect(201);
    const p1Id = p1Res.body.data.payout.id as string;

    const p2Res = await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '60000',
        currency: 'PKR',
        transactionId: `HBL-P2-${Date.now()}`,
        transferDate: today(),
      })
      .expect(201);
    const p2Id = p2Res.body.data.payout.id as string;

    // #88: Teacher A raises a concern on P1 within the 7-day window -> status becomes DISPUTED
    const concernRes = await http()
      .post(`/teacher/payouts/${p1Id}/concerns`)
      .set('Cookie', teacherA)
      .send({ reason: 'Bank statement shows PKR 400 instead of PKR 500' })
      .expect(201);

    expect(concernRes.body.data.payout.status).toBe('DISPUTED');
    expect(concernRes.body.data.dispute).toMatchObject({
      payoutId: p1Id,
      teacherId: teacherAId,
      status: 'OPEN',
      reason: 'Bank statement shows PKR 400 instead of PKR 500',
    });

    // Raising a second concern on an already-disputed payout is refused (409)
    await http()
      .post(`/teacher/payouts/${p1Id}/concerns`)
      .set('Cookie', teacherA)
      .send({ reason: 'Duplicate concern' })
      .expect(409);

    // Move both P1 (DISPUTED) and P2 (PENDING) disputeDeadlines into the past (8 days ago)
    const pastDeadline = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await prisma.payout.updateMany({
      where: { id: { in: [p1Id, p2Id] } },
      data: { disputeDeadline: pastDeadline },
    });

    // #88: Teacher cannot raise a concern on P2 now that its 7-day window has closed
    await http()
      .post(`/teacher/payouts/${p2Id}/concerns`)
      .set('Cookie', teacherA)
      .send({ reason: 'Too late concern' })
      .expect(409);

    // #87: Run auto-accept sweep -> P2 (PENDING) becomes ACCEPTED, while P1 (DISPUTED) is skipped!
    const acceptedCount = await payoutService.autoAcceptDuePayouts(new Date());
    expect(acceptedCount).toBeGreaterThanOrEqual(1);

    const p1AfterJob = await prisma.payout.findUniqueOrThrow({ where: { id: p1Id } });
    const p2AfterJob = await prisma.payout.findUniqueOrThrow({ where: { id: p2Id } });
    expect(p1AfterJob.status).toBe('DISPUTED');
    expect(p1AfterJob.acceptedAt).toBeNull();
    expect(p2AfterJob.status).toBe('ACCEPTED');
    expect(p2AfterJob.acceptedAt).not.toBeNull();

    // #89: Admin resolves P1's open concern (even after the 7-day window — no time limit on resolution)
    // and records a +10,000 adjustment credit linked to the dispute
    const resolveRes = await http()
      .post(`/admin/payouts/${p1Id}/concerns/resolve`)
      .set('Cookie', admin)
      .send({
        resolutionNotes: 'Confirmed bank fee deduction; crediting PKR 100.00 back to ledger',
        adjustmentAmountMinor: '10000',
        adjustmentCurrency: 'PKR',
      })
      .expect(200);

    expect(resolveRes.body.data.payout.status).toBe('RESOLVED');
    expect(resolveRes.body.data.adjustmentEntry).toMatchObject({
      teacherId: teacherAId,
      type: 'ADJUSTMENT',
      amountMinor: '10000',
      currency: 'PKR',
    });
    expect(resolveRes.body.data.dispute).toMatchObject({
      payoutId: p1Id,
      status: 'RESOLVED',
      resolutionNotes: 'Confirmed bank fee deduction; crediting PKR 100.00 back to ledger',
      adjustmentLedgerId: resolveRes.body.data.adjustmentEntry.id,
      resolvedById: adminId,
    });
  });
});
