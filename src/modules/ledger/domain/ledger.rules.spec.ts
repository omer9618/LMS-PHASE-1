import { Prisma } from '@prisma/client';
import { LedgerDao } from '../dao/ledger.dao';
import {
  assertOrderRefundable,
  assertTargetIsTeacher,
  assertValidLedgerEntryDraft,
  buildAdjustmentEntry,
  buildEarningEntries,
  buildPayoutEntry,
  buildRefundEntries,
  buildTeacherEarningsDashboard,
  computeCurrencyBalance,
  separatePendingAndConfirmedSales,
  TeacherSaleOrderItem,
  computeDerivedBalances,
  LedgerRefusedError,
} from './ledger.rules';

describe('ledger rules (#78, #79, #80, #81, #82, #83, #84)', () => {
  const lines = [
    { orderItemId: 'i1', teacherId: 't1', courseTitle: 'Chem', netTeacherMinor: 120000n },
    { orderItemId: 'i2', teacherId: 't2', courseTitle: 'Maths', netTeacherMinor: 0n },
  ];

  describe('append-only model & compensating entry invariants (#78)', () => {
    it('LedgerDao exposes no update, upsert, or delete operations (append-only by construction)', () => {
      const protoMethods = Object.getOwnPropertyNames(LedgerDao.prototype).filter(
        (name) => name !== 'constructor',
      );
      expect(protoMethods).toEqual(['createLedgerEntry', 'getLedgerEntriesBy', 'getPayoutsBy']);
      for (const method of protoMethods) {
        expect(method).not.toMatch(/update|delete|upsert|remove|edit/i);
      }
    });

    it('builds negative REFUND compensating entries without mutating original earnings', () => {
      const refunds = buildRefundEntries(lines, 'PKR', 'LMS-AAAA-BBBB', 'ref-1', new Set());
      expect(refunds).toEqual([
        {
          teacherId: 't1',
          type: 'REFUND',
          amountMinor: -120000n,
          currency: 'PKR',
          orderItemId: 'i1',
          refundId: 'ref-1',
          description: 'Refund of "Chem" (order LMS-AAAA-BBBB)',
        },
        {
          teacherId: 't2',
          type: 'REFUND',
          amountMinor: 0n,
          currency: 'PKR',
          orderItemId: 'i2',
          refundId: 'ref-1',
          description: 'Refund of "Maths" (order LMS-AAAA-BBBB)',
        },
      ]);
    });

    it('refuses duplicate refund entries, missing refundId, or invalid currency on refunds', () => {
      expect(() => buildRefundEntries(lines, 'PKR', 'R', 'ref-1', new Set(['i1']))).toThrow(
        LedgerRefusedError,
      );
      expect(() => buildRefundEntries([lines[0]!, lines[0]!], 'PKR', 'R', 'ref-1', new Set())).toThrow(
        LedgerRefusedError,
      );
      expect(() => buildRefundEntries(lines, 'PKR', 'R', '   ', new Set())).toThrow(
        LedgerRefusedError,
      );
      expect(() => buildRefundEntries(lines, 'usd', 'R', 'ref-1', new Set())).toThrow(
        LedgerRefusedError,
      );
    });

    it('builds signed ADJUSTMENT compensating entries (positive credit or negative debit) and refuses zero or blank reason', () => {
      expect(
        buildAdjustmentEntry({
          teacherId: 't1',
          amountMinor: 25000n,
          currency: 'PKR',
          reason: '  Underpayment correction for March  ',
        }),
      ).toEqual({
        teacherId: 't1',
        type: 'ADJUSTMENT',
        amountMinor: 25000n,
        currency: 'PKR',
        description: 'Underpayment correction for March',
      });

      expect(
        buildAdjustmentEntry({
          teacherId: 't1',
          amountMinor: -15000n,
          currency: 'PKR',
          reason: 'Overpayment clawback',
        }),
      ).toEqual({
        teacherId: 't1',
        type: 'ADJUSTMENT',
        amountMinor: -15000n,
        currency: 'PKR',
        description: 'Overpayment clawback',
      });

      expect(() =>
        buildAdjustmentEntry({
          teacherId: 't1',
          amountMinor: 0n,
          currency: 'PKR',
          reason: 'No-op adjustment',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        buildAdjustmentEntry({
          teacherId: 't1',
          amountMinor: 500n,
          currency: 'PKR',
          reason: '   ',
        }),
      ).toThrow(LedgerRefusedError);
    });

    it('builds negative PAYOUT compensating entries from positive payout amounts', () => {
      expect(
        buildPayoutEntry({
          teacherId: 't1',
          payoutId: 'pay-1',
          amountMinor: 120000n,
          currency: 'PKR',
          description: 'Bank transfer HBL-999',
        }),
      ).toEqual({
        teacherId: 't1',
        type: 'PAYOUT',
        amountMinor: -120000n,
        currency: 'PKR',
        payoutId: 'pay-1',
        description: 'Bank transfer HBL-999',
      });

      expect(() =>
        buildPayoutEntry({
          teacherId: 't1',
          payoutId: 'pay-1',
          amountMinor: 0n,
          currency: 'PKR',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        buildPayoutEntry({
          teacherId: 't1',
          payoutId: 'pay-1',
          amountMinor: -100n,
          currency: 'PKR',
        }),
      ).toThrow(LedgerRefusedError);
    });

    it('enforces sign and reference invariants on raw ledger drafts', () => {
      expect(() =>
        assertValidLedgerEntryDraft({
          teacherId: '',
          type: 'EARNING',
          amountMinor: 100n,
          currency: 'PKR',
          orderItemId: 'i1',
          description: 'Sale',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertValidLedgerEntryDraft({
          teacherId: 't1',
          type: 'EARNING',
          amountMinor: 100n,
          currency: 'PKR',
          description: 'Sale without orderItemId',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertValidLedgerEntryDraft({
          teacherId: 't1',
          type: 'REFUND',
          amountMinor: 100n,
          currency: 'PKR',
          orderItemId: 'i1',
          refundId: 'r1',
          description: 'Positive refund is invalid',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertValidLedgerEntryDraft({
          teacherId: 't1',
          type: 'PAYOUT',
          amountMinor: 100n,
          currency: 'PKR',
          payoutId: 'p1',
          description: 'Positive payout is invalid',
        }),
      ).toThrow(LedgerRefusedError);
    });
  });

  describe('balance derived from ledger entries (#79)', () => {
    it('Prisma schema has no stored balance column on any model', () => {
      for (const model of Prisma.dmmf.datamodel.models) {
        for (const field of model.fields) {
          expect(`${model.name}.${field.name}`).not.toMatch(/balance/i);
        }
      }
    });

    it('computes balance as the exact sum of earnings, refunds, payouts, and adjustments per currency', () => {
      const entries = [
        { type: 'EARNING' as const, amountMinor: 200000n, currency: 'PKR' },
        { type: 'EARNING' as const, amountMinor: 150000n, currency: 'PKR' },
        { type: 'REFUND' as const, amountMinor: -50000n, currency: 'PKR' },
        { type: 'ADJUSTMENT' as const, amountMinor: 10000n, currency: 'PKR' },
        { type: 'ADJUSTMENT' as const, amountMinor: -5000n, currency: 'PKR' },
        { type: 'PAYOUT' as const, amountMinor: -180000n, currency: 'PKR' },
        { type: 'EARNING' as const, amountMinor: 9000n, currency: 'USD' },
      ];

      expect(computeDerivedBalances(entries)).toEqual([
        {
          currency: 'PKR',
          balanceMinor: 125000n,
          earningsMinor: 350000n,
          refundsMinor: -50000n,
          payoutsMinor: -180000n,
          adjustmentsMinor: 5000n,
          entryCount: 6,
        },
        {
          currency: 'USD',
          balanceMinor: 9000n,
          earningsMinor: 9000n,
          refundsMinor: 0n,
          payoutsMinor: 0n,
          adjustmentsMinor: 0n,
          entryCount: 1,
        },
      ]);
    });

    it('returns zeroed balance for a requested currency with no ledger entries', () => {
      expect(computeCurrencyBalance([], 'PKR')).toEqual({
        currency: 'PKR',
        balanceMinor: 0n,
        earningsMinor: 0n,
        refundsMinor: 0n,
        payoutsMinor: 0n,
        adjustmentsMinor: 0n,
        entryCount: 0,
      });
    });

    it('refuses invalid currency codes when deriving balance', () => {
      expect(() => computeCurrencyBalance([], 'pkr')).toThrow(LedgerRefusedError);
      expect(() =>
        computeDerivedBalances([{ type: 'EARNING', amountMinor: 100n, currency: 'bad' }]),
      ).toThrow(LedgerRefusedError);
    });
  });

  describe('pending versus confirmed sales separation (#81)', () => {
    const t0 = new Date('2026-04-01T10:00:00.000Z');
    const tVerified = new Date('2026-04-01T12:00:00.000Z');

    const saleItems: TeacherSaleOrderItem[] = [
      {
        id: 'item-pending',
        orderId: 'o1',
        paymentReference: 'LMS-1111-AAAA',
        orderStatus: 'PENDING',
        currency: 'PKR',
        courseId: 'c1',
        courseTitle: 'Chemistry',
        teacherId: 't1',
        priceMinor: 150000n,
        commissionRateBps: 2000,
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
        orderCreatedAt: t0,
        orderVerifiedAt: null,
      },
      {
        id: 'item-proof',
        orderId: 'o2',
        paymentReference: 'LMS-2222-BBBB',
        orderStatus: 'PROOF_SUBMITTED',
        currency: 'PKR',
        courseId: 'c2',
        courseTitle: 'Mathematics',
        teacherId: 't1',
        priceMinor: 100000n,
        commissionRateBps: 2000,
        commissionMinor: 20000n,
        netTeacherMinor: 80000n,
        orderCreatedAt: t0,
        orderVerifiedAt: null,
      },
      {
        id: 'item-verified',
        orderId: 'o3',
        paymentReference: 'LMS-3333-CCCC',
        orderStatus: 'VERIFIED',
        currency: 'PKR',
        courseId: 'c1',
        courseTitle: 'Chemistry',
        teacherId: 't1',
        priceMinor: 150000n,
        commissionRateBps: 2000,
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
        orderCreatedAt: t0,
        orderVerifiedAt: tVerified,
      },
      {
        id: 'item-rejected',
        orderId: 'o4',
        paymentReference: 'LMS-4444-DDDD',
        orderStatus: 'REJECTED',
        currency: 'PKR',
        courseId: 'c1',
        courseTitle: 'Chemistry',
        teacherId: 't1',
        priceMinor: 150000n,
        commissionRateBps: 2000,
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
        orderCreatedAt: t0,
        orderVerifiedAt: null,
      },
      {
        id: 'item-lapsed',
        orderId: 'o5',
        paymentReference: 'LMS-5555-EEEE',
        orderStatus: 'LAPSED',
        currency: 'PKR',
        courseId: 'c1',
        courseTitle: 'Chemistry',
        teacherId: 't1',
        priceMinor: 150000n,
        commissionRateBps: 2000,
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
        orderCreatedAt: t0,
        orderVerifiedAt: null,
      },
    ];

    it('separates unverified sales (PENDING, PROOF_SUBMITTED) from confirmed (VERIFIED) sales and earned ledger balance', () => {
      const ledgerEntries = [
        { type: 'EARNING' as const, amountMinor: 120000n, currency: 'PKR' },
      ];
      const result = separatePendingAndConfirmedSales(saleItems, ledgerEntries);

      expect(result.pending.items.map((i) => i.id)).toEqual(['item-pending', 'item-proof']);
      expect(result.pending.totalsByCurrency).toEqual([
        {
          currency: 'PKR',
          itemCount: 2,
          grossMinor: 250000n,
          commissionMinor: 50000n,
          netTeacherMinor: 200000n,
        },
      ]);

      expect(result.confirmed.items.map((i) => i.id)).toEqual(['item-verified']);
      expect(result.confirmed.totalsByCurrency).toEqual([
        {
          currency: 'PKR',
          itemCount: 1,
          grossMinor: 150000n,
          commissionMinor: 30000n,
          netTeacherMinor: 120000n,
        },
      ]);

      // Earned balance reflects ONLY the ledger (120000n), never unverified sales (200000n)
      expect(result.earnedBalances).toEqual([
        {
          currency: 'PKR',
          balanceMinor: 120000n,
          earningsMinor: 120000n,
          refundsMinor: 0n,
          payoutsMinor: 0n,
          adjustmentsMinor: 0n,
          entryCount: 1,
        },
      ]);
    });
  });

  describe('order refund validation (#82)', () => {
    it('accepts a valid refund against a VERIFIED order', () => {
      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'VERIFIED',
          orderTotalMinor: 150000n,
          amountMinor: 150000n,
          reason: 'Student requested cancellation within policy',
          transactionId: 'HBL-REF-001',
          transferDate: '2026-04-02',
        }),
      ).not.toThrow();
    });

    it('refuses refunds on non-verified orders, excess amounts, or missing fields', () => {
      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'PENDING',
          orderTotalMinor: 150000n,
          amountMinor: 150000n,
          reason: 'Reason',
          transactionId: 'TX-1',
          transferDate: '2026-04-02',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'REFUNDED',
          orderTotalMinor: 150000n,
          amountMinor: 150000n,
          reason: 'Already refunded',
          transactionId: 'TX-1',
          transferDate: '2026-04-02',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'VERIFIED',
          orderTotalMinor: 150000n,
          amountMinor: 150001n,
          reason: 'Too much',
          transactionId: 'TX-1',
          transferDate: '2026-04-02',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'VERIFIED',
          orderTotalMinor: 150000n,
          amountMinor: 0n,
          reason: 'Zero refund',
          transactionId: 'TX-1',
          transferDate: '2026-04-02',
        }),
      ).toThrow(LedgerRefusedError);

      expect(() =>
        assertOrderRefundable({
          orderId: 'o1',
          orderStatus: 'VERIFIED',
          orderTotalMinor: 150000n,
          amountMinor: 150000n,
          reason: '   ',
          transactionId: 'TX-1',
          transferDate: '2026-04-02',
        }),
      ).toThrow(LedgerRefusedError);
    });
  });

  describe('manual balance adjustments target validation (#83)', () => {
    it('accepts accounts holding the TEACHER role and refuses non-teachers', () => {
      expect(() => assertTargetIsTeacher('t1', ['STUDENT', 'TEACHER'])).not.toThrow();
      expect(() => assertTargetIsTeacher('s1', ['STUDENT'])).toThrow(LedgerRefusedError);
      expect(() => assertTargetIsTeacher('a1', ['ADMIN'])).toThrow(LedgerRefusedError);
    });
  });

  describe('teacher earnings dashboard (#84)', () => {
    it('assembles derived balances, pending vs confirmed sales, ledger entries, and payout history', () => {
      const t0 = new Date('2026-04-01T10:00:00.000Z');
      const dashboard = buildTeacherEarningsDashboard({
        orderItems: [
          {
            id: 'oi-1',
            orderId: 'o1',
            paymentReference: 'LMS-1111-AAAA',
            orderStatus: 'VERIFIED',
            currency: 'PKR',
            courseId: 'c1',
            courseTitle: 'Chemistry',
            teacherId: 't1',
            priceMinor: 150000n,
            commissionRateBps: 2000,
            commissionMinor: 30000n,
            netTeacherMinor: 120000n,
            orderCreatedAt: t0,
            orderVerifiedAt: t0,
          },
        ],
        ledgerEntries: [
          {
            id: 'le-1',
            teacherId: 't1',
            type: 'EARNING',
            amountMinor: 120000n,
            currency: 'PKR',
            orderItemId: 'oi-1',
            payoutId: null,
            refundId: null,
            description: 'Sale of "Chemistry"',
            createdById: 'admin-1',
            createdAt: t0,
          },
        ],
        payouts: [
          {
            id: 'pay-1',
            teacherId: 't1',
            amountMinor: 50000n,
            method: 'BANK_TRANSFER',
            transactionId: 'HBL-001',
            periodStart: null,
            periodEnd: null,
            status: 'ACCEPTED',
            recordedById: 'admin-1',
            recordedAt: t0,
            transferDate: t0,
            disputeDeadline: t0,
            acceptedAt: t0,
          },
        ],
      });

      expect(dashboard.balances[0]?.balanceMinor).toBe(120000n);
      expect(dashboard.confirmedSales.items).toHaveLength(1);
      expect(dashboard.pendingSales.items).toHaveLength(0);
      expect(dashboard.ledgerEntries).toHaveLength(1);
      expect(dashboard.payouts).toHaveLength(1);
    });
  });

  describe('earning entries (#80)', () => {
    it('writes one EARNING per line for the net amount in the order currency', () => {
      expect(buildEarningEntries(lines, 'PKR', 'LMS-AAAA-BBBB', new Set())).toEqual([
        {
          teacherId: 't1',
          type: 'EARNING',
          amountMinor: 120000n,
          currency: 'PKR',
          orderItemId: 'i1',
          description: 'Sale of "Chem" (order LMS-AAAA-BBBB)',
        },
        {
          teacherId: 't2',
          type: 'EARNING',
          amountMinor: 0n,
          currency: 'PKR',
          orderItemId: 'i2',
          description: 'Sale of "Maths" (order LMS-AAAA-BBBB)',
        },
      ]);
    });

    it('refuses a line that already has an earning, or appears twice', () => {
      expect(() => buildEarningEntries(lines, 'PKR', 'R', new Set(['i2']))).toThrow(
        LedgerRefusedError,
      );
      expect(() => buildEarningEntries([lines[0]!, lines[0]!], 'PKR', 'R', new Set())).toThrow(
        LedgerRefusedError,
      );
    });

    it('refuses negative amounts and bad currencies', () => {
      expect(() =>
        buildEarningEntries([{ ...lines[0]!, netTeacherMinor: -1n }], 'PKR', 'R', new Set()),
      ).toThrow(LedgerRefusedError);
      expect(() => buildEarningEntries(lines, 'pkr', 'R', new Set())).toThrow(LedgerRefusedError);
    });
  });
});