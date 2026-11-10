import {
  assertEmailVerifiedForOrder,
  buildCartQuote,
  buildDuplicateTransactionIdWarning,
  buildDuplicateTransactionIdWarnings,
  buildOrderReceipt,
  buildPaymentInstructions,
  BuyerFacts,
  computeLineSplit,
  computeOrderExpiry,
  describeStudentOrderNextStep,
  EmailNotVerifiedError,
  formatPaymentReference,
  InvalidOrderTransitionError,
  isOrderDueToLapse,
  lastPaymentDecision,
  OPEN_ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderAction,
  OrderRefusedError,
  OrderStatusValue,
  PAYMENT_REFERENCE_PATTERN,
  PurchasableCourseFacts,
  transitionOrder,
} from './order.rules';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const STATUSES: OrderStatusValue[] = [
  'PENDING',
  'PROOF_SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'LAPSED',
  'REFUNDED',
];
const ACTIONS: OrderAction[] = [
  'SUBMIT_PROOF',
  'CONFIRM',
  'REQUEST_TOP_UP',
  'REJECT',
  'LAPSE',
  'REFUND',
];

/** The decided lifecycle (#57), written out independently of ORDER_TRANSITIONS. */
const EXPECTED: Record<string, OrderStatusValue> = {
  'PENDING:SUBMIT_PROOF': 'PROOF_SUBMITTED',
  'PROOF_SUBMITTED:SUBMIT_PROOF': 'PROOF_SUBMITTED',
  'REJECTED:SUBMIT_PROOF': 'PROOF_SUBMITTED',
  'PROOF_SUBMITTED:CONFIRM': 'VERIFIED',
  'PROOF_SUBMITTED:REJECT': 'REJECTED',
  'PROOF_SUBMITTED:REQUEST_TOP_UP': 'PENDING',
  'PENDING:LAPSE': 'LAPSED',
  'REJECTED:LAPSE': 'LAPSED',
  'VERIFIED:REFUND': 'REFUNDED',
};

describe('order state machine (#57)', () => {
  const cases = STATUSES.flatMap((from) => ACTIONS.map((action) => [from, action] as const));

  it.each(cases)('%s + %s', (from, action) => {
    const expected = EXPECTED[`${from}:${action}`];
    if (expected) {
      const result = transitionOrder(from, action, NOW, 48);
      expect(result.from).toBe(from);
      expect(result.to).toBe(expected);
      expect(result.transitionedAt).toBe(NOW);
      expect(result.auditAction).toBe(ORDER_TRANSITIONS[action].auditAction);
    } else {
      expect(() => transitionOrder(from, action, NOW, 48)).toThrow(InvalidOrderTransitionError);
    }
  });

  it('stamps verifiedAt only on confirmation', () => {
    expect(transitionOrder('PROOF_SUBMITTED', 'CONFIRM', NOW).verifiedAt).toBe(NOW);
    expect(transitionOrder('PENDING', 'SUBMIT_PROOF', NOW).verifiedAt).toBeUndefined();
  });

  it('restarts the expiry clock on rejection and top-up request only', () => {
    const fresh = new Date('2026-11-04T10:00:00.000Z');
    expect(transitionOrder('PROOF_SUBMITTED', 'REJECT', NOW, 48).expiresAt).toEqual(fresh);
    expect(transitionOrder('PROOF_SUBMITTED', 'REQUEST_TOP_UP', NOW, 48).expiresAt).toEqual(fresh);
    expect(transitionOrder('PENDING', 'SUBMIT_PROOF', NOW, 48).expiresAt).toBeUndefined();
    expect(transitionOrder('PROOF_SUBMITTED', 'CONFIRM', NOW, 48).expiresAt).toBeUndefined();
  });

  it('needs the expiry window for transitions that restart the clock', () => {
    expect(() => transitionOrder('PROOF_SUBMITTED', 'REJECT', NOW)).toThrow(/expiry window/);
  });

  it('names the allowed source states in the error', () => {
    try {
      transitionOrder('LAPSED', 'SUBMIT_PROOF', NOW);
      fail('expected an error');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOrderTransitionError);
      expect((error as InvalidOrderTransitionError).info).toEqual({
        from: 'LAPSED',
        action: 'SUBMIT_PROOF',
        allowedFrom: ['PENDING', 'PROOF_SUBMITTED', 'REJECTED'],
      });
    }
  });

  it('treats PENDING, PROOF_SUBMITTED and REJECTED as open', () => {
    expect([...OPEN_ORDER_STATUSES].sort()).toEqual(['PENDING', 'PROOF_SUBMITTED', 'REJECTED']);
  });
});

describe('expiry (#61)', () => {
  it('computes the window end', () => {
    expect(computeOrderExpiry(NOW, 48)).toEqual(new Date('2026-11-04T10:00:00.000Z'));
  });

  it('lapses PENDING and REJECTED orders at or after expiry only', () => {
    const past = new Date(NOW.getTime() - 1);
    expect(isOrderDueToLapse({ status: 'PENDING', expiresAt: past }, NOW)).toBe(true);
    expect(isOrderDueToLapse({ status: 'REJECTED', expiresAt: NOW }, NOW)).toBe(true);
    expect(isOrderDueToLapse({ status: 'PROOF_SUBMITTED', expiresAt: past }, NOW)).toBe(false);
    expect(isOrderDueToLapse({ status: 'VERIFIED', expiresAt: past }, NOW)).toBe(false);
    expect(
      isOrderDueToLapse({ status: 'PENDING', expiresAt: new Date(NOW.getTime() + 1) }, NOW),
    ).toBe(false);
    expect(isOrderDueToLapse({ status: 'PENDING', expiresAt: null }, NOW)).toBe(false);
  });
});

describe('payment reference (#55)', () => {
  it('formats LMS-XXXX-XXXX in Crockford base32', () => {
    const ref = formatPaymentReference(new Uint8Array([0, 1, 2, 3, 28, 29, 30, 31]));
    expect(ref).toBe('LMS-0123-WXYZ');
    expect(ref).toMatch(PAYMENT_REFERENCE_PATTERN);
  });

  it('never uses the ambiguous letters I, L, O or U', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (let offset = 0; offset < 256; offset += 8) {
      const ref = formatPaymentReference(all.subarray(offset, offset + 8));
      expect(ref).toMatch(PAYMENT_REFERENCE_PATTERN);
      expect(ref.slice(4)).not.toMatch(/[ILOU]/);
    }
  });

  it('needs 8 random bytes', () => {
    expect(() => formatPaymentReference(new Uint8Array(7))).toThrow();
  });
});

describe('commission split (#56)', () => {
  it.each([
    // price, bps, commission, net
    [150000n, 2000, 30000n, 120000n],
    [100n, 0, 0n, 100n],
    [100n, 10000, 100n, 0n],
    [1n, 5000, 1n, 0n], // 0.5 rounds up
    [1n, 4999, 0n, 1n], // 0.4999 rounds down
    [3n, 5000, 2n, 1n], // 1.5 rounds up
    [999n, 1250, 125n, 874n], // 124.875 rounds up
    [1000n, 1255, 126n, 874n], // 125.5 rounds up
    [1000n, 1254, 125n, 875n], // 125.4 rounds down
    [999_999_999_999_999_999n, 3333, 333_300_000_000_000_000n, 666_699_999_999_999_999n],
  ])('%s at %s bps -> %s commission + %s net', (price, bps, commission, net) => {
    const split = computeLineSplit(price, bps);
    expect(split).toEqual({ commissionMinor: commission, netTeacherMinor: net });
    expect(split.commissionMinor + split.netTeacherMinor).toBe(price);
  });

  it('refuses non-positive prices and out-of-range rates', () => {
    expect(() => computeLineSplit(0n, 100)).toThrow(OrderRefusedError);
    expect(() => computeLineSplit(100n, -1)).toThrow(OrderRefusedError);
    expect(() => computeLineSplit(100n, 10001)).toThrow(OrderRefusedError);
    expect(() => computeLineSplit(100n, 1.5)).toThrow(OrderRefusedError);
  });
});

describe('cart (#54)', () => {
  const course = (overrides: Partial<PurchasableCourseFacts> = {}): PurchasableCourseFacts => ({
    id: 'c1',
    title: 'Chemistry',
    status: 'PUBLISHED',
    audienceType: 'STUDENT',
    isFree: false,
    isEnrollmentOpen: true,
    priceMinor: 150000n,
    currency: 'PKR',
    commissionRateBps: 2000,
    teacherId: 't1',
    teacherName: 'Teacher A',
    teacherActive: true,
    ...overrides,
  });
  const buyer = (overrides: Partial<BuyerFacts> = {}): BuyerFacts => ({
    buyerId: 's1',
    activeCourseIds: new Set(),
    openOrderCourseIds: new Set(),
    ...overrides,
  });
  const reasonOf = (fn: () => unknown): unknown => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(OrderRefusedError);
      return ((error as OrderRefusedError).info as { reason: string }).reason;
    }
    throw new Error('expected a refusal');
  };

  it('totals courses from several teachers and splits each line', () => {
    const quote = buildCartQuote(
      ['c1', 'c2', 'c1'],
      [
        course(),
        course({ id: 'c2', teacherId: 't2', priceMinor: 275000n, commissionRateBps: 1500 }),
      ],
      buyer(),
    );
    expect(quote.totalMinor).toBe(425000n);
    expect(quote.currency).toBe('PKR');
    expect(quote.teacherCount).toBe(2);
    expect(quote.items.map((i) => i.courseId)).toEqual(['c1', 'c2']);
    expect(quote.items[1]).toMatchObject({ commissionMinor: 41250n, netTeacherMinor: 233750n });
  });

  it('refuses an empty cart and unknown courses', () => {
    expect(reasonOf(() => buildCartQuote([], [], buyer()))).toBe('EMPTY_CART');
    expect(reasonOf(() => buildCartQuote(['x'], [], buyer()))).toBe('NOT_AVAILABLE');
  });

  it('refuses mixed currencies', () => {
    expect(
      reasonOf(() =>
        buildCartQuote(['c1', 'c2'], [course(), course({ id: 'c2', currency: 'USD' })], buyer()),
      ),
    ).toBe('CURRENCY_MISMATCH');
  });

  it.each([
    ['NOT_AVAILABLE', { status: 'DRAFT' as const }, {}],
    ['NOT_AVAILABLE', { status: 'ARCHIVED' as const }, {}],
    ['NOT_AVAILABLE', { audienceType: 'TEACHER_PD' as const }, {}],
    ['TEACHER_SUSPENDED', { teacherActive: false }, {}],
    ['ENROLLMENT_CLOSED', { isEnrollmentOpen: false }, {}],
    ['OWN_COURSE', { teacherId: 's1' }, {}],
    ['FREE_COURSE', { isFree: true }, {}],
    ['ALREADY_ENROLLED', {}, { activeCourseIds: new Set(['c1']) }],
    ['IN_OPEN_ORDER', {}, { openOrderCourseIds: new Set(['c1']) }],
    ['NOT_PRICED', { priceMinor: null }, {}],
    ['NOT_PRICED', { currency: null }, {}],
    ['NOT_PRICED', { commissionRateBps: null }, {}],
  ])('refuses %s', (reason, courseOverrides, buyerOverrides) => {
    const refusal = reasonOf(() =>
      buildCartQuote(['c1'], [course(courseOverrides)], buyer(buyerOverrides)),
    );
    expect(refusal).toBe(reason);
  });

  it('names the refused course', () => {
    try {
      buildCartQuote(['c1'], [course({ isEnrollmentOpen: false })], buyer());
    } catch (error) {
      expect((error as OrderRefusedError).info).toMatchObject({ courseId: 'c1' });
    }
  });
});

describe('email verification (#11)', () => {
  it('refuses an unverified buyer', () => {
    expect(() => assertEmailVerifiedForOrder(false)).toThrow(EmailNotVerifiedError);
    expect(() => assertEmailVerifiedForOrder(true)).not.toThrow();
  });
});

describe('payment instructions (#55)', () => {
  it('carries the bank text, reference, amount, currency, deadline and turnaround', () => {
    const expiresAt = computeOrderExpiry(NOW, 48);
    expect(
      buildPaymentInstructions(
        { paymentReference: 'LMS-AAAA-BBBB', totalMinor: 500n, currency: 'PKR', expiresAt },
        'Bank X',
        24,
      ),
    ).toEqual({
      bankTransferInstructions: 'Bank X',
      paymentReference: 'LMS-AAAA-BBBB',
      amountMinor: 500n,
      currency: 'PKR',
      expiresAt,
      verificationTurnaroundHours: 24,
    });
  });
});

describe('duplicate transaction ids (#59)', () => {
  const matches = [
    { orderId: 'o2', paymentReference: 'LMS-2222-2222', transactionId: ' TX-1 ' },
    { orderId: 'o3', paymentReference: 'LMS-3333-3333', transactionId: 'tx-1' },
    { orderId: 'o1', paymentReference: 'LMS-1111-1111', transactionId: 'TX-1' },
  ];

  it('warns about other orders, ignoring case and spaces', () => {
    const warning = buildDuplicateTransactionIdWarning('o1', 'TX-1', matches);
    expect(warning?.conflictingOrderIds).toEqual(['o2', 'o3']);
    expect(warning?.conflictingPaymentReferences).toEqual(['LMS-2222-2222', 'LMS-3333-3333']);
  });

  it('returns null when only the same order uses it', () => {
    expect(buildDuplicateTransactionIdWarning('o1', 'TX-1', [matches[2]!])).toBeNull();
    expect(buildDuplicateTransactionIdWarning('o1', 'TX-9', matches)).toBeNull();
  });

  it('gives one warning per distinct id', () => {
    expect(
      buildDuplicateTransactionIdWarnings('o1', ['TX-1', 'tx-1', 'TX-9'], matches),
    ).toHaveLength(1);
  });
});

describe('last payment decision and next step (#60, #65, #66)', () => {
  const rejected = {
    outcome: 'REJECTED' as const,
    mismatchAction: null,
    rejectionReason: 'INVALID_TRANSACTION_ID',
    notes: 'No such transfer',
    amountReceivedMinor: null,
  };
  const topUp = {
    outcome: 'REJECTED' as const,
    mismatchAction: 'REQUEST_TOP_UP' as const,
    rejectionReason: 'AMOUNT_SHORT',
    notes: null,
    amountReceivedMinor: 400n,
  };

  it('reads the latest non-confirming decision', () => {
    expect(lastPaymentDecision(1000n, [])).toBeNull();
    expect(lastPaymentDecision(1000n, [topUp])).toEqual({
      kind: 'TOP_UP_REQUESTED',
      shortfallMinor: 600n,
    });
    expect(lastPaymentDecision(1000n, [topUp, rejected])).toEqual({
      kind: 'REJECTED',
      reason: 'The transaction ID could not be matched to a transfer',
      notes: 'No such transfer',
    });
    expect(
      lastPaymentDecision(1000n, [
        rejected,
        { ...rejected, outcome: 'CONFIRMED', rejectionReason: null },
      ]),
    ).toBeNull();
  });

  const describe_ = (
    status: OrderStatusValue,
    lastDecision: Parameters<typeof describeStudentOrderNextStep>[0]['lastDecision'] = null,
  ) =>
    describeStudentOrderNextStep({
      status,
      paymentReference: 'LMS-AAAA-BBBB',
      totalMinor: 1000n,
      currency: 'PKR',
      expiresAt: NOW,
      verificationTurnaroundHours: 48,
      lastDecision,
    });

  it('asks for payment on a new order', () => {
    const g = describe_('PENDING');
    expect(g).toMatchObject({ nextAction: 'SUBMIT_PROOF', canSubmitProof: true });
    expect(g.whatHappensNext).toContain('LMS-AAAA-BBBB');
  });

  it('asks for the shortfall after a top-up request', () => {
    const g = describe_('PENDING', { kind: 'TOP_UP_REQUESTED', shortfallMinor: 600n });
    expect(g.statusLabel).toBe('Top-up required');
    expect(g.whatHappensNext).toContain('600');
  });

  it('promises the turnaround while under review', () => {
    const g = describe_('PROOF_SUBMITTED');
    expect(g.nextAction).toBe('WAIT_FOR_VERIFICATION');
    expect(g.whatHappensNext).toContain('48 hours');
  });

  it('shows the reason and allows resubmission after rejection', () => {
    const g = describe_('REJECTED', { kind: 'REJECTED', reason: 'Bad id', notes: 'typo' });
    expect(g).toMatchObject({ nextAction: 'SUBMIT_PROOF', canSubmitProof: true });
    expect(g.whatHappensNext).toContain('Bad id (typo)');
  });

  it.each(['VERIFIED', 'LAPSED', 'REFUNDED'] as const)('%s needs nothing more', (status) => {
    expect(describe_(status)).toMatchObject({ nextAction: 'NONE', canSubmitProof: false });
  });
});

describe('receipt (#62)', () => {
  const order = {
    id: 'o1',
    paymentReference: 'LMS-AAAA-BBBB',
    verifiedAt: NOW,
    totalMinor: 1000n,
    currency: 'PKR',
    student: { fullName: 'Zain', email: 'z@test.local' },
    items: [{ courseId: 'c1', courseTitle: 'Chem', teacherName: 'T', priceMinor: 1000n }],
  };

  it('is issued for a verified order', () => {
    expect(buildOrderReceipt({ ...order, status: 'VERIFIED' })).toMatchObject({
      receiptNumber: 'RCT-AAAA-BBBB',
      issuedAt: NOW,
      totalMinor: 1000n,
    });
  });

  it.each(['PENDING', 'PROOF_SUBMITTED', 'REJECTED', 'LAPSED', 'REFUNDED'] as const)(
    'is refused for %s',
    (status) => {
      expect(() => buildOrderReceipt({ ...order, status })).toThrow(OrderRefusedError);
    },
  );
});
