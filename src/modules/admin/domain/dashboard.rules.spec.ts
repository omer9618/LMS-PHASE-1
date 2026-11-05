import {
  AdminFinanceError,
  buildAdminFinancialSummary,
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

      expect(() =>
        parseFinancialPeriodBounds({ from: '2026-05-01', to: '2026-04-30' }),
      ).toThrow(AdminFinanceError);
    });
  });

  describe('buildAdminFinancialSummary (#104)', () => {
    it('aggregates period sales, commission, refunds, payouts, and cumulative liability up to period end', () => {
      const bounds = parseFinancialPeriodBounds({ from: '2026-04-01', to: '2026-04-30' });
      const summary = buildAdminFinancialSummary({
        bounds,
        confirmedSales: [
          {
            currency: 'PKR',
            priceMinor: 100000n,
            commissionMinor: 30000n,
            netTeacherMinor: 70000n,
            verifiedAt: new Date('2026-03-15T10:00:00.000Z'),
          },
          {
            currency: 'PKR',
            priceMinor: 200000n,
            commissionMinor: 60000n,
            netTeacherMinor: 140000n,
            verifiedAt: new Date('2026-04-10T10:00:00.000Z'),
          },
        ],
        refunds: [
          {
            currency: 'PKR',
            amountMinor: 50000n,
            createdAt: new Date('2026-04-12T10:00:00.000Z'),
          },
        ],
        payouts: [
          {
            currency: 'PKR',
            amountMinor: 80000n,
            recordedAt: new Date('2026-04-20T10:00:00.000Z'),
          },
        ],
        ledgerEntries: [
          // March earning (before period, counts toward cumulative liability)
          {
            currency: 'PKR',
            type: 'EARNING',
            amountMinor: 70000n,
            createdAt: new Date('2026-03-15T10:00:00.000Z'),
          },
          // April earning
          {
            currency: 'PKR',
            type: 'EARNING',
            amountMinor: 140000n,
            createdAt: new Date('2026-04-10T10:00:00.000Z'),
          },
          // April refund debit
          {
            currency: 'PKR',
            type: 'REFUND',
            amountMinor: -35000n,
            createdAt: new Date('2026-04-12T10:00:00.000Z'),
          },
          // April manual adjustment
          {
            currency: 'PKR',
            type: 'ADJUSTMENT',
            amountMinor: 5000n,
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
          },
          // April payout debit
          {
            currency: 'PKR',
            type: 'PAYOUT',
            amountMinor: -80000n,
            createdAt: new Date('2026-04-20T10:00:00.000Z'),
          },
          // May earning (after period, excluded from both period and cumulative as of period end)
          {
            currency: 'PKR',
            type: 'EARNING',
            amountMinor: 90000n,
            createdAt: new Date('2026-05-02T10:00:00.000Z'),
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
  });
});