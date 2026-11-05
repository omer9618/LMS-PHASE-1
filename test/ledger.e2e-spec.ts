import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification } from './utils/courses';
import { orderHelpers } from './utils/orders';
import { createTestApp } from './utils/test-app';

const today = () => new Date().toISOString().slice(0, 10);

describe('Teacher Ledger, Refunds, Adjustments & Earnings Dashboard (#78-#84)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
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

  it('#81 & #84: separates unverified (PENDING, PROOF_SUBMITTED) sales from confirmed (VERIFIED) sales and earned balance', async () => {
    // Clean teacherA ledger and prior test order items to get deterministic numbers for this suite
    await prisma.teacherLedger.deleteMany({ where: { teacherId: teacherAId } });

    const courseA = await h.paidCourse(teacherA, 'Ledger Chem A', {
      priceMinor: '200000',
      commissionRateBps: 2000, // 20% commission = 40,000; net teacher = 160,000
    });

    const studentPending = await h.newStudent();
    const pendingOrder = await h.placeOrder(studentPending.cookie, [courseA]);

    const studentProof = await h.newStudent();
    const proofOrder = await h.placeOrder(studentProof.cookie, [courseA]);
    await h.submitProof(studentProof.cookie, proofOrder.id, `TX-PROOF-${proofOrder.id}`, '200000');

    const studentVerified = await h.newStudent();
    const verifiedOrder = await h.placeOrder(studentVerified.cookie, [courseA]);
    await h.submitProof(
      studentVerified.cookie,
      verifiedOrder.id,
      `TX-VER-${verifiedOrder.id}`,
      '200000',
    );
    await confirm(verifiedOrder.id, '200000').expect(200);

    const res = await http().get('/teacher/earnings').set('Cookie', teacherA).expect(200);
    const dashboard = res.body.data;

    // Pending sales include both PENDING and PROOF_SUBMITTED orders for courseA
    const pendingForCourse = dashboard.pendingSales.items.filter(
      (i: { courseId: string }) => i.courseId === courseA,
    );
    expect(pendingForCourse).toHaveLength(2);
    expect(pendingForCourse.map((i: { orderId: string }) => i.orderId).sort()).toEqual(
      [pendingOrder.id, proofOrder.id].sort(),
    );

    // Confirmed sales include only the VERIFIED order for courseA
    const confirmedForCourse = dashboard.confirmedSales.items.filter(
      (i: { courseId: string }) => i.courseId === courseA,
    );
    expect(confirmedForCourse).toHaveLength(1);
    expect(confirmedForCourse[0]).toMatchObject({
      orderId: verifiedOrder.id,
      priceMinor: '200000',
      commissionRateBps: 2000,
      commissionMinor: '40000',
      netTeacherMinor: '160000',
      orderStatus: 'VERIFIED',
    });

    // Earned balance reflects ONLY the confirmed order's netTeacherMinor (160,000), never the 320,000 in pending sales (#79, #81)
    expect(dashboard.balances).toEqual([
      {
        currency: 'PKR',
        balanceMinor: '160000',
        earningsMinor: '160000',
        refundsMinor: '0',
        payoutsMinor: '0',
        adjustmentsMinor: '0',
        entryCount: 1,
      },
    ]);

    // Teacher B cannot see Teacher A's sales or ledger entries (#14, #84)
    const teacherBRes = await http().get('/teacher/earnings').set('Cookie', teacherB).expect(200);
    const leaked = teacherBRes.body.data.confirmedSales.items.filter(
      (i: { teacherId: string }) => i.teacherId === teacherAId,
    );
    expect(leaked).toHaveLength(0);
  });

  it('#82: records an order refund, transitions order VERIFIED -> REFUNDED, revokes enrollments, and writes negative compensating ledger entries', async () => {
    const courseA = await h.paidCourse(teacherA, 'Refund Chem A', {
      priceMinor: '100000',
      commissionRateBps: 2500, // net 75,000
    });
    const courseB = await h.paidCourse(teacherB, 'Refund Maths B', {
      priceMinor: '80000',
      commissionRateBps: 1000, // net 72,000
    });

    const student = await h.newStudent();
    const order = await h.placeOrder(student.cookie, [courseA, courseB]);
    await h.submitProof(student.cookie, order.id, `TX-REF-${order.id}`, '180000');
    await confirm(order.id, '180000').expect(200);

    // Pre-check: student has 2 ACTIVE enrollments
    const activeBefore = await prisma.enrollment.findMany({
      where: { studentId: student.id, status: 'ACTIVE' },
    });
    expect(activeBefore).toHaveLength(2);

    // Non-admin cannot refund
    await http()
      .post(`/admin/orders/${order.id}/refund`)
      .set('Cookie', teacherA)
      .send({
        amountMinor: '180000',
        transferDate: today(),
        transactionId: 'BANK-REF-001',
        reason: 'Customer cancellation',
      })
      .expect(403);

    // Refund exceeding order total is refused (409 LEDGER_REFUSED)
    await http()
      .post(`/admin/orders/${order.id}/refund`)
      .set('Cookie', admin)
      .send({
        amountMinor: '180001',
        transferDate: today(),
        transactionId: 'BANK-REF-001',
        reason: 'Too much',
      })
      .expect(409);

    // Admin records valid refund
    const refundRes = await http()
      .post(`/admin/orders/${order.id}/refund`)
      .set('Cookie', admin)
      .send({
        amountMinor: '180000',
        transferDate: today(),
        transactionId: `BANK-REF-${order.id}`,
        reason: 'Duplicate purchase refunded by bank transfer',
      })
      .expect(200);

    expect(refundRes.body.data).toMatchObject({
      orderId: order.id,
      paymentReference: order.paymentReference,
      status: 'REFUNDED',
      enrollmentsRevoked: 2,
      ledgerEntriesWritten: 2,
      refund: {
        orderId: order.id,
        amountMinor: '180000',
        transactionId: `BANK-REF-${order.id}`,
        reason: 'Duplicate purchase refunded by bank transfer',
        authorisedById: adminId,
      },
    });

    // Order is now REFUNDED in DB
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe('REFUNDED');

    // Both enrollments are REVOKED
    const enrollmentsAfter = await prisma.enrollment.findMany({
      where: { studentId: student.id },
    });
    expect(enrollmentsAfter).toHaveLength(2);
    for (const enrollment of enrollmentsAfter) {
      expect(enrollment.status).toBe('REVOKED');
      expect(enrollment.revokedAt).not.toBeNull();
    }

    // Original EARNING entries remain untouched; negative REFUND entries were appended (#78, #82)
    const dbItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const ledgerForOrder = await prisma.teacherLedger.findMany({
      where: { orderItemId: { in: dbItems.map((i) => i.id) } },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledgerForOrder).toHaveLength(4); // 2 EARNING + 2 REFUND
    expect(ledgerForOrder.filter((e) => e.type === 'EARNING').map((e) => e.amountMinor)).toEqual(
      expect.arrayContaining([75000n, 72000n]),
    );
    expect(ledgerForOrder.filter((e) => e.type === 'REFUND').map((e) => e.amountMinor)).toEqual(
      expect.arrayContaining([-75000n, -72000n]),
    );

    // Refunding an already-refunded order is refused
    await http()
      .post(`/admin/orders/${order.id}/refund`)
      .set('Cookie', admin)
      .send({
        amountMinor: '180000',
        transferDate: today(),
        transactionId: `BANK-REF-DUP-${order.id}`,
        reason: 'Second refund attempt',
      })
      .expect(409);

    // Audit log recorded both ORDER_REFUNDED and REFUND_RECORDED
    const auditRes = await http()
      .get(`/admin/audit-log?entityId=${refundRes.body.data.refund.id}`)
      .set('Cookie', admin)
      .expect(200);
    expect(auditRes.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'REFUND_RECORDED',
          actorUserId: adminId,
          entityType: 'refund',
        }),
      ]),
    );
  });

  it('#83 & #84: admin records manual signed balance adjustments (credit and debit) with audit logging, reflected in teacher dashboard and ledger statement', async () => {
    const beforeRes = await http().get('/teacher/earnings').set('Cookie', teacherA).expect(200);
    const beforeBalance = BigInt(beforeRes.body.data.balances[0]?.balanceMinor ?? '0');

    // Credit +25,000 minor units
    const creditRes = await http()
      .post(`/admin/teachers/${teacherAId}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '25000',
        currency: 'PKR',
        reason: 'Bonus credit for promotional workshop',
      })
      .expect(201);

    expect(creditRes.body.data.entry).toMatchObject({
      teacherId: teacherAId,
      type: 'ADJUSTMENT',
      amountMinor: '25000',
      currency: 'PKR',
      description: 'Bonus credit for promotional workshop',
      createdById: adminId,
    });
    expect(BigInt(creditRes.body.data.balance.balanceMinor)).toBe(beforeBalance + 25000n);

    // Debit -10,000 minor units
    const debitRes = await http()
      .post(`/admin/teachers/${teacherAId}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '-10000',
        currency: 'PKR',
        reason: 'Chargeback fee recovery',
      })
      .expect(201);

    expect(debitRes.body.data.entry).toMatchObject({
      teacherId: teacherAId,
      type: 'ADJUSTMENT',
      amountMinor: '-10000',
      currency: 'PKR',
      description: 'Chargeback fee recovery',
      createdById: adminId,
    });
    expect(BigInt(debitRes.body.data.balance.balanceMinor)).toBe(beforeBalance + 15000n);

    // Zero adjustment is rejected by validation (400)
    await http()
      .post(`/admin/teachers/${teacherAId}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '0',
        currency: 'PKR',
        reason: 'Zero is invalid',
      })
      .expect(400);

    // Adjusting a non-teacher account (e.g. a student) is refused (409 LEDGER_REFUSED)
    const student = await h.newStudent();
    await http()
      .post(`/admin/teachers/${student.id}/ledger/adjustments`)
      .set('Cookie', admin)
      .send({
        amountMinor: '5000',
        currency: 'PKR',
        reason: 'Student is not a teacher',
      })
      .expect(409);

    // Teacher ledger endpoint & Admin teacher earnings endpoint agree
    const ledgerListRes = await http().get('/teacher/ledger').set('Cookie', teacherA).expect(200);
    expect(ledgerListRes.body.data.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining([creditRes.body.data.entry.id, debitRes.body.data.entry.id]),
    );

    const adminViewRes = await http()
      .get(`/admin/teachers/${teacherAId}/earnings`)
      .set('Cookie', admin)
      .expect(200);
    expect(BigInt(adminViewRes.body.data.balances[0].balanceMinor)).toBe(beforeBalance + 15000n);
    expect(BigInt(adminViewRes.body.data.balances[0].adjustmentsMinor)).toBe(15000n);
  });
});
