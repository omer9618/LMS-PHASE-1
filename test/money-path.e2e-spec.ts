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

describe('End-to-End Money Path Verification (#115, #116 — NFR-8.1)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let payoutService: PayoutService;
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
    payoutService = app.get(PayoutService);
    teacherA = await loginAs(app, SEEDED.teacherA);
    teacherB = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    h = orderHelpers(app, await classification(app), () => admin);
    teacherAId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherA.email } }))
      .id;
    teacherBId = (await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherB.email } }))
      .id;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('reconciles multi-teacher order confirmation, commission split, append-only ledger, refund, adjustment, payout, dispute resolution, and admin financial views to the exact minor unit', async () => {
    // Isolate ledger & payout state for teacherA and teacherB
    await prisma.payoutDispute.deleteMany({
      where: { teacherId: { in: [teacherAId, teacherBId] } },
    });
    await prisma.teacherLedger.deleteMany({
      where: { teacherId: { in: [teacherAId, teacherBId] } },
    });
    await prisma.payout.deleteMany({
      where: { teacherId: { in: [teacherAId, teacherBId] } },
    });

    // 1. Two teachers publish courses with distinct prices and basis-point commission rates:
    //    - Course A1 (Teacher A): 250,000 minor (PKR 2,500.00), 20% commission (2000 bps) -> commission 50,000, net teacher 200,000
    //    - Course B1 (Teacher B): 100,000 minor (PKR 1,000.00), 30% commission (3000 bps) -> commission 30,000, net teacher 70,000
    const courseA1 = await h.paidCourse(teacherA, 'Money Path Course A1', {
      priceMinor: '250000',
      commissionRateBps: 2000,
    });
    const courseB1 = await h.paidCourse(teacherB, 'Money Path Course B1', {
      priceMinor: '100000',
      commissionRateBps: 3000,
    });

    // 2. Student 1 places a multi-course order (total = 350,000) and submits proof
    const student1 = await h.newStudent();
    const order1 = await h.placeOrder(student1.cookie, [courseA1, courseB1]);
    expect(order1.totalMinor).toBe('350000');
    await h.submitProof(student1.cookie, order1.id, 'TX-MP-MULTI-1');

    // Before confirmation: sales appear as PENDING, ledger balances are 0
    const preEarnA = await http().get('/teacher/earnings').set('Cookie', teacherA).expect(200);
    expect(preEarnA.body.data.balances).toEqual([]);
    expect(
      preEarnA.body.data.pendingSales.items.some(
        (item: { orderId: string }) => item.orderId === order1.id,
      ),
    ).toBe(true);

    // 3. Admin confirms Order 1 -> writes EARNING ledger entries & grants PURCHASE enrollments
    await http()
      .post(`/admin/verification/orders/${order1.id}/confirm`)
      .set('Cookie', admin)
      .send({ amountReceivedMinor: '350000', valueDate: today() })
      .expect(200);

    // Verify Teacher A balance = 200,000 and Teacher B balance = 70,000
    const afterOrder1A = await http().get('/teacher/earnings').set('Cookie', teacherA).expect(200);
    expect(afterOrder1A.body.data.balances).toEqual([
      {
        currency: 'PKR',
        earningsMinor: '200000',
        refundsMinor: '0',
        adjustmentsMinor: '0',
        payoutsMinor: '0',
        balanceMinor: '200000',
        entryCount: 1,
      },
    ]);

    const afterOrder1B = await http().get('/teacher/earnings').set('Cookie', teacherB).expect(200);
    expect(afterOrder1B.body.data.balances).toEqual([
      {
        currency: 'PKR',
        earningsMinor: '70000',
        refundsMinor: '0',
        adjustmentsMinor: '0',
        payoutsMinor: '0',
        balanceMinor: '70000',
        entryCount: 1,
      },
    ]);

    // 4. Student 2 buys Course B1, Admin confirms, and then Admin refunds Order 2
    const student2 = await h.newStudent();
    const order2 = await h.placeOrder(student2.cookie, [courseB1]);
    await h.submitProof(student2.cookie, order2.id, 'TX-MP-REFUND-2');
    await http()
      .post(`/admin/verification/orders/${order2.id}/confirm`)
      .set('Cookie', admin)
      .send({ amountReceivedMinor: '100000', valueDate: today() })
      .expect(200);

    const refundRes = await http()
      .post(`/admin/orders/${order2.id}/refund`)
      .set('Cookie', admin)
      .send({
        amountMinor: '100000',
        transferDate: today(),
        transactionId: 'BANK-REF-MP-2',
        reason: 'Duplicate purchase refund',
      })
      .expect(200);
    expect(refundRes.body.data).toMatchObject({
      orderId: order2.id,
      status: 'REFUNDED',
      enrollmentsRevoked: 1,
      ledgerEntriesWritten: 1,
    });

    // Teacher B had two earnings (+70,000 each = +140,000) and one refund (-70,000) -> net balance 70,000
    const afterRefundB = await http().get('/teacher/earnings').set('Cookie', teacherB).expect(200);
    expect(afterRefundB.body.data.balances).toEqual([
      {
        currency: 'PKR',
        earningsMinor: '140000',
        refundsMinor: '-70000',
        adjustmentsMinor: '0',
        payoutsMinor: '0',
        balanceMinor: '70000',
        entryCount: 3,
      },
    ]);

    // 5. Admin records a manual adjustment (+15,000) for Teacher A -> balance becomes 215,000
    await http()
      .post(`/admin/teachers/${teacherAId}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '15000',
        currency: 'PKR',
        reason: 'Q4 high-completion bonus',
      })
      .expect(201);

    // 6. Admin attempts to over-pay Teacher A (220,000 > 215,000) -> refused with 409 PAYOUT_REFUSED
    await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '220000',
        currency: 'PKR',
        transactionId: 'BANK-OVERPAY-MP',
        transferDate: today(),
      })
      .expect(409);

    // 7. Admin records a valid payout of 150,000 for Teacher A -> balance becomes 65,000
    const payoutRes = await http()
      .post(`/admin/teachers/${teacherAId}/payouts`)
      .set('Cookie', admin)
      .send({
        amountMinor: '150000',
        currency: 'PKR',
        transactionId: 'BANK-PAY-MP-A1',
        transferDate: today(),
        periodStart: '2020-01-01',
        periodEnd: '2030-12-31',
      })
      .expect(201);
    const payoutId: string = payoutRes.body.data.payout.id;
    expect(payoutRes.body.data.remainingBalance.balanceMinor).toBe('65000');
    expect(mailbox(app).lastTo(SEEDED.teacherA.email, 'PAYOUT_RECORDED')).toBeDefined();

    // 8. Teacher A raises a concern on the payout (-5,000 bank deduction discrepancy)
    await http()
      .post(`/teacher/payouts/${payoutId}/concerns`)
      .set('Cookie', teacherA)
      .send({ reason: 'Received PKR 1,450 instead of PKR 1,500' })
      .expect(201);

    // Disputed payout is skipped by auto-accept sweep even past deadline
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    await payoutService.autoAcceptDuePayouts(future);
    const stillDisputed = await http()
      .get(`/teacher/payouts/${payoutId}`)
      .set('Cookie', teacherA)
      .expect(200);
    expect(stillDisputed.body.data.payout.status).toBe('DISPUTED');

    // 9. Admin resolves the concern with a +5,000 compensating ledger adjustment -> balance becomes 70,000
    await http()
      .post(`/admin/payouts/${payoutId}/concerns/resolve`)
      .set('Cookie', admin)
      .send({
        resolutionNotes: 'Credited PKR 50.00 wire fee back to teacher ledger',
        adjustmentAmountMinor: '5000',
        adjustmentCurrency: 'PKR',
      })
      .expect(200);

    // 10. Reconcile Teacher A statement (#105) and SQL SUM(amount_minor) in teacher_ledger
    const stmtA = await http()
      .get(`/admin/teachers/${teacherAId}/statement`)
      .set('Cookie', admin)
      .expect(200);
    expect(stmtA.body.data.balances).toEqual([
      {
        currency: 'PKR',
        earningsMinor: '200000',
        refundsMinor: '0',
        adjustmentsMinor: '20000',
        payoutsMinor: '-150000',
        balanceMinor: '70000',
        entryCount: 4,
      },
    ]);

    const dbSumA = await prisma.teacherLedger.aggregate({
      where: { teacherId: teacherAId, currency: 'PKR' },
      _sum: { amountMinor: true },
    });
    expect(dbSumA._sum.amountMinor).toBe(70000n);

    const dbSumB = await prisma.teacherLedger.aggregate({
      where: { teacherId: teacherBId, currency: 'PKR' },
      _sum: { amountMinor: true },
    });
    expect(dbSumB._sum.amountMinor).toBe(70000n);
  });
});
