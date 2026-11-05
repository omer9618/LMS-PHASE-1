import {
  assertCanRaisePayoutConcern,
  buildPayoutCoverageEmailLines,
  buildPayoutRecordingPlan,
  formatPayoutMoney,
  isPayoutDueToAutoAccept,
  computePayoutDisputeDeadline,
  CoveredSaleItem,
  PayoutRefusedError,
  selectCoveredSalesForPayout,
} from './payout.rules';

describe('payout rules (#85, #86, #87, #88, #113)', () => {
  const now = new Date('2026-04-10T10:00:00.000Z');

  it('computes dispute deadline N days after payout recording time', () => {
    expect(computePayoutDisputeDeadline(now, 7).toISOString()).toBe('2026-04-17T10:00:00.000Z');
    expect(() => computePayoutDisputeDeadline(now, 0)).toThrow(PayoutRefusedError);
  });

  it('builds a payout recording plan when teacher has sufficient ledger balance', () => {
    const plan = buildPayoutRecordingPlan({
      teacherId: 't1',
      teacherRoles: ['TEACHER'],
      amountMinor: 120000n,
      currency: 'PKR',
      availableBalanceMinor: 160000n,
      transactionId: '  HBL-PAY-001  ',
      transferDate: '2026-04-10',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-09',
      disputeWindowDays: 7,
      now,
    });

    expect(plan).toEqual({
      amountMinor: 120000n,
      currency: 'PKR',
      method: 'BANK_TRANSFER',
      transactionId: 'HBL-PAY-001',
      transferDate: new Date('2026-04-10T00:00:00.000Z'),
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-09T00:00:00.000Z'),
      disputeDeadline: new Date('2026-04-17T10:00:00.000Z'),
      ledgerDescription: 'Payout HBL-PAY-001 (2026-04-01 to 2026-04-09)',
    });
  });

  it('refuses payouts exceeding teacher balance, non-teachers, inverted periods, or blank transactionId', () => {
    expect(() =>
      buildPayoutRecordingPlan({
        teacherId: 't1',
        teacherRoles: ['TEACHER'],
        amountMinor: 160001n,
        currency: 'PKR',
        availableBalanceMinor: 160000n,
        transactionId: 'HBL-001',
        transferDate: '2026-04-10',
        disputeWindowDays: 7,
        now,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      buildPayoutRecordingPlan({
        teacherId: 's1',
        teacherRoles: ['STUDENT'],
        amountMinor: 1000n,
        currency: 'PKR',
        availableBalanceMinor: 160000n,
        transactionId: 'HBL-001',
        transferDate: '2026-04-10',
        disputeWindowDays: 7,
        now,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      buildPayoutRecordingPlan({
        teacherId: 't1',
        teacherRoles: ['TEACHER'],
        amountMinor: 1000n,
        currency: 'PKR',
        availableBalanceMinor: 160000n,
        transactionId: 'HBL-001',
        transferDate: '2026-04-10',
        periodStart: '2026-04-10',
        periodEnd: '2026-04-01',
        disputeWindowDays: 7,
        now,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      buildPayoutRecordingPlan({
        teacherId: 't1',
        teacherRoles: ['TEACHER'],
        amountMinor: 1000n,
        currency: 'PKR',
        availableBalanceMinor: 160000n,
        transactionId: '   ',
        transferDate: '2026-04-10',
        disputeWindowDays: 7,
        now,
      }),
    ).toThrow(PayoutRefusedError);
  });

  it('selects confirmed sales within the payout period and currency', () => {
    const sales: CoveredSaleItem[] = [
      {
        orderItemId: 'oi-1',
        orderId: 'o1',
        paymentReference: 'LMS-1',
        courseId: 'c1',
        courseTitle: 'Chem',
        priceMinor: 100000n,
        commissionRateBps: 2000,
        commissionMinor: 20000n,
        netTeacherMinor: 80000n,
        currency: 'PKR',
        verifiedAt: new Date('2026-04-02T15:00:00.000Z'),
      },
      {
        orderItemId: 'oi-2',
        orderId: 'o2',
        paymentReference: 'LMS-2',
        courseId: 'c1',
        courseTitle: 'Chem',
        priceMinor: 100000n,
        commissionRateBps: 2000,
        commissionMinor: 20000n,
        netTeacherMinor: 80000n,
        currency: 'PKR',
        verifiedAt: new Date('2026-04-12T15:00:00.000Z'),
      },
    ];

    const covered = selectCoveredSalesForPayout(
      sales,
      'PKR',
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-09T00:00:00.000Z'),
    );
    expect(covered.map((s) => s.orderItemId)).toEqual(['oi-1']);
    expect(formatPayoutMoney(160050n, 'PKR')).toBe('PKR 1,600.50');
    expect(buildPayoutCoverageEmailLines(covered)).toEqual([
      ['Sale: Chem (LMS-1)', 'PKR 800.00'],
    ]);
  });

  it('#87: auto-accepts only PENDING payouts at or past their disputeDeadline, skipping DISPUTED payouts', () => {
    const deadline = new Date('2026-04-17T10:00:00.000Z');
    const before = new Date('2026-04-17T09:59:59.999Z');
    const after = new Date('2026-04-17T10:00:00.000Z');

    expect(isPayoutDueToAutoAccept({ status: 'PENDING', disputeDeadline: deadline }, before)).toBe(
      false,
    );
    expect(isPayoutDueToAutoAccept({ status: 'PENDING', disputeDeadline: deadline }, after)).toBe(
      true,
    );
    expect(isPayoutDueToAutoAccept({ status: 'DISPUTED', disputeDeadline: deadline }, after)).toBe(
      false,
    );
    expect(isPayoutDueToAutoAccept({ status: 'ACCEPTED', disputeDeadline: deadline }, after)).toBe(
      false,
    );
    expect(isPayoutDueToAutoAccept({ status: 'RESOLVED', disputeDeadline: deadline }, after)).toBe(
      false,
    );
  });

  it('#88: allows raising a concern before disputeDeadline on a PENDING payout, and blocks afterwards or on non-pending payouts', () => {
    const deadline = new Date('2026-04-17T10:00:00.000Z');
    const withinWindow = new Date('2026-04-15T10:00:00.000Z');
    const afterWindow = new Date('2026-04-17T10:00:00.000Z');

    expect(
      assertCanRaisePayoutConcern({
        payoutId: 'p1',
        status: 'PENDING',
        disputeDeadline: deadline,
        reason: '  Amount received was PKR 10,000 short  ',
        now: withinWindow,
      }),
    ).toBe('Amount received was PKR 10,000 short');

    expect(() =>
      assertCanRaisePayoutConcern({
        payoutId: 'p1',
        status: 'PENDING',
        disputeDeadline: deadline,
        reason: 'Late concern',
        now: afterWindow,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      assertCanRaisePayoutConcern({
        payoutId: 'p1',
        status: 'ACCEPTED',
        disputeDeadline: deadline,
        reason: 'Already accepted',
        now: withinWindow,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      assertCanRaisePayoutConcern({
        payoutId: 'p1',
        status: 'DISPUTED',
        disputeDeadline: deadline,
        reason: 'Already disputed',
        now: withinWindow,
      }),
    ).toThrow(PayoutRefusedError);

    expect(() =>
      assertCanRaisePayoutConcern({
        payoutId: 'p1',
        status: 'PENDING',
        disputeDeadline: deadline,
        reason: '   ',
        now: withinWindow,
      }),
    ).toThrow(PayoutRefusedError);
  });
});