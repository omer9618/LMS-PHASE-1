import {
  assertRejectionReason,
  checkClaimedAmount,
  currentRoundProofs,
  decidePaymentConfirmation,
  DecisionFacts,
  minutesBetween,
  queueMetrics,
  VerificationRefusedError,
  waitingSince,
} from './verification.rules';

const NOW = new Date('2026-11-02T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

const reasonOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(VerificationRefusedError);
    return ((error as VerificationRefusedError).info as { reason: string }).reason;
  }
  throw new Error('expected a refusal');
};

describe('payment confirmation (#64, #66)', () => {
  const base = { totalMinor: 1000n, valueDate: '2026-11-01', now: NOW };

  it('confirms an exact amount', () => {
    expect(decidePaymentConfirmation({ ...base, amountReceivedMinor: 1000n })).toEqual({
      action: 'CONFIRM',
      differenceMinor: 0n,
      mismatchAction: null,
      rejectionReason: null,
    });
  });

  it('refuses a mismatch action when nothing mismatches', () => {
    expect(
      reasonOf(() =>
        decidePaymentConfirmation({
          ...base,
          amountReceivedMinor: 1000n,
          mismatchAction: 'CONFIRM_ANYWAY',
        }),
      ),
    ).toBe('NO_MISMATCH');
  });

  it('requires a mismatch action and reports the difference', () => {
    try {
      decidePaymentConfirmation({ ...base, amountReceivedMinor: 900n });
      fail('expected a refusal');
    } catch (error) {
      expect((error as VerificationRefusedError).info).toEqual({
        reason: 'MISMATCH_ACTION_REQUIRED',
        totalMinor: '1000',
        amountReceivedMinor: '900',
        differenceMinor: '-100',
      });
    }
  });

  it('confirms anyway, short or over', () => {
    expect(
      decidePaymentConfirmation({
        ...base,
        amountReceivedMinor: 900n,
        mismatchAction: 'CONFIRM_ANYWAY',
      }),
    ).toMatchObject({
      action: 'CONFIRM',
      differenceMinor: -100n,
      mismatchAction: 'CONFIRM_ANYWAY',
    });
    expect(
      decidePaymentConfirmation({
        ...base,
        amountReceivedMinor: 1100n,
        mismatchAction: 'CONFIRM_ANYWAY',
      }),
    ).toMatchObject({ action: 'CONFIRM', differenceMinor: 100n });
  });

  it('requests a top-up only for a short payment', () => {
    expect(
      decidePaymentConfirmation({
        ...base,
        amountReceivedMinor: 400n,
        mismatchAction: 'REQUEST_TOP_UP',
      }),
    ).toEqual({
      action: 'REQUEST_TOP_UP',
      differenceMinor: -600n,
      mismatchAction: 'REQUEST_TOP_UP',
      rejectionReason: 'AMOUNT_SHORT',
    });
    expect(
      reasonOf(() =>
        decidePaymentConfirmation({
          ...base,
          amountReceivedMinor: 1100n,
          mismatchAction: 'REQUEST_TOP_UP',
        }),
      ),
    ).toBe('NOT_SHORT');
  });

  it('rejects: short is AMOUNT_SHORT, over uses the given reason or OTHER', () => {
    expect(
      decidePaymentConfirmation({
        ...base,
        amountReceivedMinor: 400n,
        mismatchAction: 'REJECT',
        rejectionReason: 'OTHER',
      }).rejectionReason,
    ).toBe('AMOUNT_SHORT');
    expect(
      decidePaymentConfirmation({ ...base, amountReceivedMinor: 1100n, mismatchAction: 'REJECT' }),
    ).toMatchObject({ action: 'REJECT', rejectionReason: 'OTHER' });
    expect(
      decidePaymentConfirmation({
        ...base,
        amountReceivedMinor: 1100n,
        mismatchAction: 'REJECT',
        rejectionReason: 'DUPLICATE_TRANSACTION',
      }).rejectionReason,
    ).toBe('DUPLICATE_TRANSACTION');
  });

  it('refuses a value date in the future but accepts today (UTC)', () => {
    expect(
      reasonOf(() =>
        decidePaymentConfirmation({ ...base, amountReceivedMinor: 1000n, valueDate: '2026-11-03' }),
      ),
    ).toBe('VALUE_DATE_IN_FUTURE');
    expect(
      decidePaymentConfirmation({ ...base, amountReceivedMinor: 1000n, valueDate: '2026-11-02' })
        .action,
    ).toBe('CONFIRM');
  });
});

describe('rejection reason (#65)', () => {
  it('needs notes for OTHER only', () => {
    expect(reasonOf(() => assertRejectionReason('OTHER', null))).toBe('NOTES_REQUIRED');
    expect(reasonOf(() => assertRejectionReason('OTHER', '  '))).toBe('NOTES_REQUIRED');
    expect(() => assertRejectionReason('OTHER', 'explained')).not.toThrow();
    expect(() => assertRejectionReason('NO_PAYMENT_RECEIVED', null)).not.toThrow();
  });
});

describe('queue facts (#63)', () => {
  const p1 = {
    id: 'p1',
    transactionId: 'a',
    amountClaimedMinor: 400n,
    submittedAt: at('2026-11-01T08:00:00Z'),
  };
  const p2 = {
    id: 'p2',
    transactionId: 'b',
    amountClaimedMinor: null,
    submittedAt: at('2026-11-01T12:00:00Z'),
  };
  const p3 = {
    id: 'p3',
    transactionId: 'c',
    amountClaimedMinor: 600n,
    submittedAt: at('2026-11-02T08:00:00Z'),
  };
  const rejection: DecisionFacts = {
    outcome: 'REJECTED',
    mismatchAction: null,
    verifiedAt: at('2026-11-01T10:00:00Z'),
  };
  const topUp: DecisionFacts = {
    outcome: 'REJECTED',
    mismatchAction: 'REQUEST_TOP_UP',
    verifiedAt: at('2026-11-01T10:00:00Z'),
  };

  it('keeps proofs after the last full rejection; a top-up keeps earlier proofs', () => {
    expect(currentRoundProofs([p1, p2, p3], []).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(currentRoundProofs([p1, p2, p3], [rejection]).map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(currentRoundProofs([p1, p2, p3], [topUp]).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('waits from the first proof after the last decision', () => {
    expect(waitingSince([p1, p2], [])).toEqual(p1.submittedAt);
    expect(waitingSince([p1, p2, p3], [topUp])).toEqual(p2.submittedAt);
    expect(waitingSince([], [])).toBeNull();
  });

  it('compares the claimed total with the order total', () => {
    expect(checkClaimedAmount(1000n, [p1, p2, p3])).toEqual({
      claimedMinor: 1000n,
      differenceMinor: 0n,
      mismatch: false,
    });
    expect(checkClaimedAmount(1000n, [p1])).toEqual({
      claimedMinor: 400n,
      differenceMinor: -600n,
      mismatch: true,
    });
    expect(checkClaimedAmount(1000n, [p2])).toEqual({
      claimedMinor: null,
      differenceMinor: null,
      mismatch: false,
    });
  });
});

describe('metrics (#67)', () => {
  it('reports size, oldest wait and how many are over the turnaround', () => {
    const metrics = queueMetrics(
      { size: 3, oldestWaitingSince: at('2026-10-30T10:00:00Z'), overTurnaround: 1 },
      48,
      NOW,
    );
    expect(metrics).toEqual({
      queueSize: 3,
      turnaroundHours: 48,
      oldestWaitingSince: at('2026-10-30T10:00:00Z'),
      oldestWaitingMinutes: 72 * 60,
      oldestOverTurnaround: true,
      overTurnaroundCount: 1,
    });
  });

  it('counts exactly the turnaround as within it', () => {
    const m = queueMetrics(
      { size: 1, oldestWaitingSince: at('2026-10-31T10:00:00Z'), overTurnaround: 0 },
      48,
      NOW,
    );
    expect(m.oldestOverTurnaround).toBe(false);
    expect(m.overTurnaroundCount).toBe(0);
  });

  it('handles an empty queue', () => {
    expect(queueMetrics({ size: 0, oldestWaitingSince: null, overTurnaround: 0 }, 24, NOW)).toEqual(
      {
        queueSize: 0,
        turnaroundHours: 24,
        oldestWaitingSince: null,
        oldestWaitingMinutes: null,
        oldestOverTurnaround: false,
        overTurnaroundCount: 0,
      },
    );
  });

  it('never reports negative minutes', () => {
    expect(minutesBetween(NOW, at('2026-11-01T00:00:00Z'))).toBe(0);
  });
});
