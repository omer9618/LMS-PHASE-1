import {
  assertPublishable,
  canTransition,
  CourseAction,
  CourseNotPriceableError,
  CourseStatusValue,
  decideApproval,
  decidePricing,
  decideRejection,
  decideSubmission,
  InvalidCourseInputError,
  InvalidCourseTransitionError,
  nextStatus,
  PublishGuardError,
  publishGuardMissing,
} from './course.rules';

const ALL_STATUSES: CourseStatusValue[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
];

/** The complete transition table for this phase. Anything not listed must be rejected. */
const VALID: Record<CourseAction, [CourseStatusValue, CourseStatusValue]> = {
  SUBMIT: ['DRAFT', 'PENDING_APPROVAL'],
  APPROVE: ['PENDING_APPROVAL', 'PUBLISHED'],
  REJECT: ['PENDING_APPROVAL', 'REJECTED'],
};

const allCases = (Object.keys(VALID) as CourseAction[]).flatMap((action) =>
  ALL_STATUSES.map((from) => ({ action, from, valid: VALID[action][0] === from })),
);

describe('course state machine', () => {
  it.each(allCases.filter((c) => c.valid))('$action from $from is allowed', ({ action, from }) => {
    expect(canTransition(from, action)).toBe(true);
    expect(nextStatus(from, action)).toBe(VALID[action][1]);
  });

  it.each(allCases.filter((c) => !c.valid))(
    '$action from $from is rejected',
    ({ action, from }) => {
      expect(canTransition(from, action)).toBe(false);
      expect(() => nextStatus(from, action)).toThrow(InvalidCourseTransitionError);
    },
  );

  it('covers all 15 action/status combinations', () => {
    expect(allCases).toHaveLength(15);
  });

  it('REJECTED is final: a rejected course cannot be resubmitted', () => {
    expect(canTransition('REJECTED', 'SUBMIT')).toBe(false);
  });

  it('reports the attempted and allowed states on an invalid transition', () => {
    try {
      nextStatus('PUBLISHED', 'APPROVE');
      fail('expected an error');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        info: { from: 'PUBLISHED', action: 'APPROVE', allowedFrom: 'PENDING_APPROVAL' },
      });
    }
  });
});

describe('publish guard', () => {
  const cases: Array<{
    name: string;
    isFree: boolean;
    priceMinor: bigint | null;
    commissionRateBps: number | null;
    missing: string[];
  }> = [
    {
      name: 'free, nothing set',
      isFree: true,
      priceMinor: null,
      commissionRateBps: null,
      missing: [],
    },
    {
      name: 'free, with stale price',
      isFree: true,
      priceMinor: 100n,
      commissionRateBps: null,
      missing: [],
    },
    {
      name: 'paid, both set',
      isFree: false,
      priceMinor: 150000n,
      commissionRateBps: 2000,
      missing: [],
    },
    {
      name: 'paid, commission 0 bps still counts as set',
      isFree: false,
      priceMinor: 150000n,
      commissionRateBps: 0,
      missing: [],
    },
    {
      name: 'paid, price missing',
      isFree: false,
      priceMinor: null,
      commissionRateBps: 2000,
      missing: ['priceMinor'],
    },
    {
      name: 'paid, commission missing',
      isFree: false,
      priceMinor: 150000n,
      commissionRateBps: null,
      missing: ['commissionRateBps'],
    },
    {
      name: 'paid, both missing',
      isFree: false,
      priceMinor: null,
      commissionRateBps: null,
      missing: ['priceMinor', 'commissionRateBps'],
    },
  ];

  it.each(cases)('$name', ({ isFree, priceMinor, commissionRateBps, missing }) => {
    const course = { isFree, priceMinor, commissionRateBps };
    expect(publishGuardMissing(course)).toEqual(missing);
    if (missing.length === 0) {
      expect(() => assertPublishable(course)).not.toThrow();
    } else {
      expect(() => assertPublishable(course)).toThrow(PublishGuardError);
    }
  });
});

describe('decisions', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const pending = {
    status: 'PENDING_APPROVAL' as const,
    isFree: false,
    priceMinor: 150000n,
    commissionRateBps: 2000,
  };

  it('approval publishes and stamps publishedAt', () => {
    expect(decideApproval(pending, now)).toEqual({ status: 'PUBLISHED', publishedAt: now });
  });

  it('approval checks the transition before the publish guard', () => {
    expect(() => decideApproval({ ...pending, status: 'DRAFT', priceMinor: null }, now)).toThrow(
      InvalidCourseTransitionError,
    );
  });

  it('approval of an unpriced paid course fails the publish guard', () => {
    expect(() => decideApproval({ ...pending, priceMinor: null }, now)).toThrow(PublishGuardError);
  });

  it('rejection needs a non-blank reason and trims it', () => {
    expect(decideRejection(pending, '  Missing syllabus mapping  ')).toEqual({
      status: 'REJECTED',
      reason: 'Missing syllabus mapping',
    });
    expect(() => decideRejection(pending, '   ')).toThrow(InvalidCourseInputError);
  });

  it('submission carries an optional, valid commission proposal', () => {
    expect(decideSubmission({ status: 'DRAFT' })).toEqual({ status: 'PENDING_APPROVAL' });
    expect(decideSubmission({ status: 'DRAFT' }, 1500)).toEqual({
      status: 'PENDING_APPROVAL',
      teacherProposedBps: 1500,
    });
    expect(() => decideSubmission({ status: 'DRAFT' }, 10_001)).toThrow(InvalidCourseInputError);
  });
});

describe('pricing (#29)', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const paid = {
    isFree: false as const,
    priceMinor: 150000n,
    currency: 'PKR',
    commissionRateBps: 2000,
  };

  it('records price, commission, who and when', () => {
    expect(decidePricing({ status: 'PENDING_APPROVAL' }, paid, 'admin-1', now)).toEqual({
      ...paid,
      pricedById: 'admin-1',
      pricedAt: now,
    });
  });

  it('a free course clears price, currency and commission', () => {
    expect(decidePricing({ status: 'PENDING_APPROVAL' }, { isFree: true }, 'admin-1', now)).toEqual(
      {
        isFree: true,
        priceMinor: null,
        currency: null,
        commissionRateBps: null,
        pricedById: 'admin-1',
        pricedAt: now,
      },
    );
  });

  it.each(ALL_STATUSES.filter((s) => s !== 'PENDING_APPROVAL'))(
    'is not allowed while %s',
    (status) => {
      expect(() => decidePricing({ status }, paid, 'admin-1', now)).toThrow(
        CourseNotPriceableError,
      );
    },
  );

  it('rejects a zero price and an out-of-range commission', () => {
    const pending = { status: 'PENDING_APPROVAL' as const };
    expect(() => decidePricing(pending, { ...paid, priceMinor: 0n }, 'a', now)).toThrow(
      InvalidCourseInputError,
    );
    expect(() => decidePricing(pending, { ...paid, commissionRateBps: -1 }, 'a', now)).toThrow(
      InvalidCourseInputError,
    );
    expect(() => decidePricing(pending, { ...paid, commissionRateBps: 10_001 }, 'a', now)).toThrow(
      InvalidCourseInputError,
    );
  });
});
