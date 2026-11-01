import {
  assertCoursePurchasable,
  buildCartQuote,
  computeLineSplit,
  OrderRefusedError,
  PurchasableCourseFacts,
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

describe('Order domain rules (#54)', () => {
  describe('computeLineSplit', () => {
    it('computes commission and net teacher earning in BigInt minor units without rounding drift', () => {
      expect(computeLineSplit(150000n, 2000)).toEqual({
        commissionMinor: 30000n,
        netTeacherMinor: 120000n,
      });
      // Odd minor unit: 999 * 15% (1500 bps) = 149 commission, 850 net (sum = 999).
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
});
