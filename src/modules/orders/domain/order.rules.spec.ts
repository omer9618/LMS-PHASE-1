import {
  assertCoursePurchasable,
  assertEmailVerifiedForOrder,
  buildCartQuote,
  buildDuplicateTransactionIdWarning,
  buildPaymentInstructions,
  computeLineSplit,
  computeOrderExpiry,
  EmailNotVerifiedError,
  formatPaymentReference,
  InvalidOrderTransitionError,
  OrderAction,
  OrderRefusedError,
  OrderStatusValue,
  PurchasableCourseFacts,
  RECEIVING_BANK_ACCOUNT,
  transitionOrder,
} from './order.rules';

function course(overrides: Partial<PurchasableCourseFacts> = {}): PurchasableCourseFacts {
  return {
    id: 'course-1',
    title: 'AS Chemistry Unit 1',
    status: 'PUBLISHED',
    audienceType: 'STUDENT',
    isFree: false,
    isEnrollmentOpen: true,
    priceMinor: 150000n,
    currency: 'PKR',
    commissionRateBps: 2000,
    teacherId: 'teacher-a',
    teacherName: 'Teacher A',
    teacherActive: true,
    ...overrides,
  };
}

describe('Order domain rules (#54, #55, #57)', () => {
  describe('computeLineSplit', () => {
    it('computes commission and net teacher earning in BigInt minor units without rounding drift', () => {
      expect(computeLineSplit(150000n, 2000)).toEqual({
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
      });
      const odd = computeLineSplit(999n, 1500);
      expect(odd.commissionMinor).toBe(149n);
      expect(odd.netTeacherMinor).toBe(850n);
      expect(odd.commissionMinor + odd.netTeacherMinor).toBe(999n);
    });

    it('rejects non-positive prices and out-of-range commission rates', () => {
      expect(() => computeLineSplit(0n, 2000)).toThrow(OrderRefusedError);
      expect(() => computeLineSplit(1000n, -1)).toThrow(OrderRefusedError);
      expect(() => computeLineSplit(1000n, 10001)).toThrow(OrderRefusedError);
    });
  });

  describe('assertCoursePurchasable', () => {
    it('rejects unpublished, PD, suspended-teacher, closed, own, free, and already-enrolled courses', () => {
      expect(() =>
        assertCoursePurchasable(course({ status: 'DRAFT' }), 'student-1', false),
      ).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'NOT_AVAILABLE' }) }),
      );
      expect(() =>
        assertCoursePurchasable(course({ audienceType: 'TEACHER_PD' }), 'student-1', false),
      ).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'NOT_AVAILABLE' }) }),
      );
      expect(() =>
        assertCoursePurchasable(course({ teacherActive: false }), 'student-1', false),
      ).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'TEACHER_SUSPENDED' }) }),
      );
      expect(() =>
        assertCoursePurchasable(course({ isEnrollmentOpen: false }), 'student-1', false),
      ).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'ENROLLMENT_CLOSED' }) }),
      );
      expect(() => assertCoursePurchasable(course(), 'teacher-a', false)).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'OWN_COURSE' }) }),
      );
      expect(() => assertCoursePurchasable(course({ isFree: true }), 'student-1', false)).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'FREE_COURSE' }) }),
      );
      expect(() => assertCoursePurchasable(course(), 'student-1', true)).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'ALREADY_ENROLLED' }) }),
      );
    });
  });

  describe('buildCartQuote (#54)', () => {
    it('combines courses from multiple teachers into one cart and sums totals in minor units', () => {
      const c1 = course({
        id: 'course-1',
        title: 'AS Chemistry Unit 1',
        teacherId: 'teacher-a',
        teacherName: 'Teacher A',
        priceMinor: 150000n,
        commissionRateBps: 2000,
      });
      const c2 = course({
        id: 'course-2',
        title: 'O Level Math Algebra',
        teacherId: 'teacher-b',
        teacherName: 'Teacher B',
        priceMinor: 225000n,
        commissionRateBps: 1500,
      });

      const quote = buildCartQuote(
        ['course-1', 'course-2', 'course-1'],
        [c1, c2],
        'student-1',
        new Set(),
      );
      expect(quote.currency).toBe('PKR');
      expect(quote.totalMinor).toBe(375000n);
      expect(quote.teacherCount).toBe(2);
      expect(quote.items).toHaveLength(2);
      expect(quote.items[0]).toMatchObject({
        courseId: 'course-1',
        teacherId: 'teacher-a',
        priceMinor: 150000n,
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
      });
      expect(quote.items[1]).toMatchObject({
        courseId: 'course-2',
        teacherId: 'teacher-b',
        priceMinor: 225000n,
        commissionMinor: 33750n,
        netTeacherMinor: 191250n,
      });
    });

    it('rejects mixed currencies in the same cart', () => {
      const c1 = course({ id: 'course-1', currency: 'PKR' });
      const c2 = course({ id: 'course-2', currency: 'USD', teacherId: 'teacher-b' });
      expect(() =>
        buildCartQuote(['course-1', 'course-2'], [c1, c2], 'student-1', new Set()),
      ).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'CURRENCY_MISMATCH' }) }),
      );
    });

    it('rejects an empty cart', () => {
      expect(() => buildCartQuote([], [], 'student-1', new Set())).toThrow(
        expect.objectContaining({ info: expect.objectContaining({ reason: 'EMPTY_CART' }) }),
      );
    });
  });

  describe('payment reference, expiry and bank instructions (#55)', () => {
    it('requires a verified email address before order creation', () => {
      expect(() => assertEmailVerifiedForOrder(false)).toThrow(EmailNotVerifiedError);
      expect(() => assertEmailVerifiedForOrder(true)).not.toThrow();
    });

    it('formats a readable LMS-YYYYMMDD-XXXXXX payment reference using unambiguous characters', () => {
      const now = new Date('2026-11-01T18:30:00.000Z');
      const ref = formatPaymentReference(now, new Uint8Array([0, 1, 2, 3, 4, 5]));
      expect(ref).toBe('LMS-20261101-234567');
      expect(ref).toMatch(/^LMS-\d{8}-[2-9A-HJ-NP-Z]{6}$/);
    });

    it('computes the order expiry instant from the configured window in hours', () => {
      const now = new Date('2026-11-01T00:00:00.000Z');
      expect(computeOrderExpiry(now, 48).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    });

    it('builds payment instructions with bank details, amount, currency and reference', () => {
      const expiresAt = new Date('2026-11-03T00:00:00.000Z');
      const instructions = buildPaymentInstructions({
        paymentReference: 'LMS-20261101-ABCDEF',
        totalMinor: 425000n,
        currency: 'PKR',
        expiresAt,
      });
      expect(instructions).toEqual({
        bank: RECEIVING_BANK_ACCOUNT,
        paymentReference: 'LMS-20261101-ABCDEF',
        amountMinor: 425000n,
        currency: 'PKR',
        expiresAt,
        instructions: expect.stringContaining('LMS-20261101-ABCDEF'),
      });
    });
  });

  describe('order lifecycle state machine (#57)', () => {
    const now = new Date('2026-11-01T12:00:00.000Z');

    it('allows valid transitions and records the transition timestamp and audit action', () => {
      expect(transitionOrder('PENDING', 'SUBMIT_PROOF', now)).toEqual({
        from: 'PENDING',
        to: 'PROOF_SUBMITTED',
        auditAction: 'ORDER_PROOF_SUBMITTED',
        transitionedAt: now,
      });
      expect(transitionOrder('PROOF_SUBMITTED', 'SUBMIT_PROOF', now)).toEqual({
        from: 'PROOF_SUBMITTED',
        to: 'PROOF_SUBMITTED',
        auditAction: 'ORDER_PROOF_SUBMITTED',
        transitionedAt: now,
      });
      expect(transitionOrder('PROOF_SUBMITTED', 'VERIFY', now)).toEqual({
        from: 'PROOF_SUBMITTED',
        to: 'VERIFIED',
        auditAction: 'ORDER_VERIFIED',
        transitionedAt: now,
        verifiedAt: now,
      });
      expect(transitionOrder('PROOF_SUBMITTED', 'REQUEST_TOP_UP', now)).toEqual({
        from: 'PROOF_SUBMITTED',
        to: 'PENDING',
        auditAction: 'ORDER_TOP_UP_REQUESTED',
        transitionedAt: now,
      });
      expect(transitionOrder('PROOF_SUBMITTED', 'REJECT', now)).toEqual({
        from: 'PROOF_SUBMITTED',
        to: 'REJECTED',
        auditAction: 'ORDER_REJECTED',
        transitionedAt: now,
      });
      expect(transitionOrder('PENDING', 'LAPSE', now)).toEqual({
        from: 'PENDING',
        to: 'LAPSED',
        auditAction: 'ORDER_LAPSED',
        transitionedAt: now,
      });
      expect(transitionOrder('VERIFIED', 'REFUND', now)).toEqual({
        from: 'VERIFIED',
        to: 'REFUNDED',
        auditAction: 'ORDER_REFUNDED',
        transitionedAt: now,
      });
    });

    it.each<[OrderStatusValue, OrderAction]>([
      ['PENDING', 'VERIFY'],
      ['PENDING', 'REQUEST_TOP_UP'],
      ['PENDING', 'REJECT'],
      ['PENDING', 'REFUND'],
      ['PROOF_SUBMITTED', 'LAPSE'],
      ['PROOF_SUBMITTED', 'REFUND'],
      ['VERIFIED', 'SUBMIT_PROOF'],
      ['VERIFIED', 'VERIFY'],
      ['VERIFIED', 'REQUEST_TOP_UP'],
      ['VERIFIED', 'REJECT'],
      ['VERIFIED', 'LAPSE'],
      ['REJECTED', 'SUBMIT_PROOF'],
      ['REJECTED', 'VERIFY'],
      ['REJECTED', 'LAPSE'],
      ['LAPSED', 'SUBMIT_PROOF'],
      ['LAPSED', 'VERIFY'],
      ['LAPSED', 'LAPSE'],
      ['REFUNDED', 'SUBMIT_PROOF'],
      ['REFUNDED', 'VERIFY'],
      ['REFUNDED', 'REFUND'],
    ])('rejects invalid transition from %s via %s', (from, action) => {
      expect(() => transitionOrder(from, action, now)).toThrow(InvalidOrderTransitionError);
    });
  });
  describe('duplicate transaction ID detection (#59)', () => {
    it('returns null when no other order uses the same transaction ID (ignoring same-order resubmissions)', () => {
      expect(
        buildDuplicateTransactionIdWarning('order-1', 'TXN-100', [
          { orderId: 'order-1', paymentReference: 'LMS-20261102-AAAAAA', transactionId: 'TXN-100' },
        ]),
      ).toBeNull();
    });

    it('returns a warning with conflicting order IDs and references when another order uses the transaction ID', () => {
      const warning = buildDuplicateTransactionIdWarning('order-2', 'TXN-100', [
        { orderId: 'order-1', paymentReference: 'LMS-20261102-AAAAAA', transactionId: 'txn-100' },
        { orderId: 'order-2', paymentReference: 'LMS-20261102-BBBBBB', transactionId: 'TXN-100' },
      ]);
      expect(warning).toEqual({
        transactionId: 'TXN-100',
        conflictingOrderIds: ['order-1'],
        conflictingPaymentReferences: ['LMS-20261102-AAAAAA'],
        message: expect.stringContaining('LMS-20261102-AAAAAA'),
      });
    });
  });
});
