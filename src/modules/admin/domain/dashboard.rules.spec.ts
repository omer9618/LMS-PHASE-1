import {
  AdminFinanceError,
  buildAdminFinancialSummary,
  buildTeacherAccountStatement,
  parseFinancialPeriodBounds,
  startOfUtcDay,
  totalAttention,
} from './dashboard.rules';

describe('dashboard & finance rules (#102, #104)', () => {
  it('today starts at midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-11-03T23:59:59.999Z'))).toEqual(
      new Date('2026-11-03T00:00:00.000Z'),
    );
    expect(startOfUtcDay(new Date('2026-11-03T00:00:00.000Z'))).toEqual(
      new Date('2026-11-03T00:00:00.000Z'),
    );
    expect(startOfUtcDay(new Date('2027-01-01T04:00:00+05:00'))).toEqual(
      new Date('2026-12-31T00:00:00.000Z'),
    );
  });

  it('totals the queues, skipping ones not available yet', () => {
    expect(totalAttention([3, null, 2, 0])).toBe(5);
    expect(totalAttention([null, null])).toBe(0);
  });

  describe('parseFinancialPeriodBounds (#104)', () => {
    it('parses inclusive UTC day bounds and rejects from > to', () => {
      const bounds = parseFinancialPeriodBounds({ from: '2026-04-01', to: '2026-04-30' });
      expect(bounds.from).toEqual(new Date('2026-04-01T00:00:00.000Z'));
      expect(bounds.to).toEqual(new Date('2026-04-30T23:59:59.999Z'));

      expect(() => parseFinancialPeriodBounds({ from: '2026-05-01', to: '2026-04-30' })).toThrow(
        AdminFinanceError,
      );
    });
  });

  describe('buildAdminFinancialSummary (#104)', () => {
    // The facts behind these totals, for the period 1-30 April 2026:
    //   sales:   March 100,000 (not in period) and April 200,000 (30% commission)
    //   refunds: 50,000 in April          payouts: 80,000 in April
    //   ledger:  March earning +70,000; April earning +140,000, refund -35,000, adjustment +5,000,
    //            payout -80,000; a May earning +90,000 that is after the period and counts nowhere
    it('combines the per-currency totals into the period summary and the liability at its end', () => {
      const bounds = parseFinancialPeriodBounds({ from: '2026-04-01', to: '2026-04-30' });
      const summary = buildAdminFinancialSummary({
        bounds,
        sales: [
          {
            currency: 'PKR',
            count: 1,
            grossMinor: 200000n,
            commissionMinor: 60000n,
            netTeacherMinor: 140000n,
          },
        ],
        refunds: [{ currency: 'PKR', count: 1, amountMinor: 50000n }],
        payouts: [{ currency: 'PKR', count: 1, amountMinor: 80000n }],
        ledger: [
          {
            currency: 'PKR',
            // 70,000 + 140,000 - 35,000 + 5,000 - 80,000: everything up to 30 April.
            outstandingMinor: 100000n,
            // The same without the March earning: what moved inside April.
            periodNetMinor: 30000n,
            refundDebitsMinor: -35000n,
            adjustmentsMinor: 5000n,
          },
        ],
      });

      expect(summary).toEqual({
        period: { from: '2026-04-01', to: '2026-04-30' },
        currencies: [
          {
            currency: 'PKR',
            confirmedSalesCount: 1,
            confirmedSalesGrossMinor: 200000n,
            commissionRetainedMinor: 60000n,
            teacherEarningsMinor: 140000n,
            refundsCount: 1,
            refundsMinor: 50000n,
            teacherRefundDebitsMinor: -35000n,
            adjustmentsMinor: 5000n,
            payoutsCount: 1,
            payoutsMinor: 80000n,
            periodNetLiabilityChangeMinor: 30000n,
            outstandingLiabilityMinor: 100000n,
          },
        ],
      });
    });

    it('lists each currency once, sorted, whichever totals mention it', () => {
      const summary = buildAdminFinancialSummary({
        bounds: parseFinancialPeriodBounds({}),
        sales: [
          {
            currency: 'USD',
            count: 2,
            grossMinor: 900n,
            commissionMinor: 90n,
            netTeacherMinor: 810n,
          },
        ],
        refunds: [],
        payouts: [{ currency: 'PKR', count: 1, amountMinor: 5n }],
        ledger: [
          {
            currency: 'USD',
            outstandingMinor: 810n,
            periodNetMinor: 810n,
            refundDebitsMinor: 0n,
            adjustmentsMinor: 0n,
          },
        ],
      });
      expect(summary.period).toEqual({ from: null, to: null });
      expect(summary.currencies.map((c) => c.currency)).toEqual(['PKR', 'USD']);
      expect(summary.currencies[1]).toMatchObject({
        confirmedSalesCount: 2,
        outstandingLiabilityMinor: 810n,
      });
    });

    it('is empty when nothing happened', () => {
      expect(
        buildAdminFinancialSummary({
          bounds: parseFinancialPeriodBounds({}),
          sales: [],
          refunds: [],
          payouts: [],
          ledger: [],
        }),
      ).toEqual({ period: { from: null, to: null }, currencies: [] });
    });
  });
  describe('buildTeacherAccountStatement (#105)', () => {
    it('separates refunds and adjustments from full ledger while preserving balances, sales, and payouts', () => {
      const statement = buildTeacherAccountStatement({
        teacher: { id: 'teacher-1', email: 't@example.com' },
        balances: [{ currency: 'PKR', balanceMinor: 37000n }],
        sales: { confirmed: { count: 1 }, pending: { count: 0 } },
        payouts: [{ id: 'payout-1', amountMinor: 30000n }],
        ledgerEntries: [
          {
            id: 'l-1',
            type: 'EARNING',
            amountMinor: 70000n,
            currency: 'PKR',
            orderItemId: 'oi-1',
            payoutId: null,
            description: 'Earning',
            createdById: 'admin-1',
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
          },
          {
            id: 'l-2',
            type: 'REFUND',
            amountMinor: -5000n,
            currency: 'PKR',
            orderItemId: 'oi-1',
            payoutId: null,
            description: 'Refund',
            createdById: 'admin-1',
            createdAt: new Date('2026-04-02T10:00:00.000Z'),
          },
          {
            id: 'l-3',
            type: 'ADJUSTMENT',
            amountMinor: 2000n,
            currency: 'PKR',
            orderItemId: null,
            payoutId: null,
            description: 'Bonus',
            createdById: 'admin-1',
            createdAt: new Date('2026-04-03T10:00:00.000Z'),
          },
          {
            id: 'l-4',
            type: 'PAYOUT',
            amountMinor: -30000n,
            currency: 'PKR',
            orderItemId: null,
            payoutId: 'payout-1',
            description: 'Payout',
            createdById: 'admin-1',
            createdAt: new Date('2026-04-04T10:00:00.000Z'),
          },
        ],
      });

      expect(statement.refunds.count).toBe(1);
      expect(statement.refunds.items[0]?.id).toBe('l-2');
      expect(statement.adjustments.count).toBe(1);
      expect(statement.adjustments.items[0]?.id).toBe('l-3');
      expect(statement.payouts.count).toBe(1);
      expect(statement.ledger.count).toBe(4);
    });
  });
});
