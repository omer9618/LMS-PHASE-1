import { DomainError } from '../../../common/errors/domain.error';

/**
 * Cart and order rules (#54). Pure: no Nest, no Prisma, no I/O.
 * All money is BigInt minor units; commission rates are integer basis points (10000 = 100%).
 */
export interface PurchasableCourseFacts {
  id: string;
  title: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  audienceType: 'STUDENT' | 'TEACHER_PD';
  isFree: boolean;
  isEnrollmentOpen: boolean;
  priceMinor: bigint | null;
  currency: string | null;
  commissionRateBps: number | null;
  teacherId: string;
  teacherName: string | null;
  teacherActive: boolean;
}

export interface CartLineQuote {
  courseId: string;
  title: string;
  teacherId: string;
  teacherName: string | null;
  priceMinor: bigint;
  currency: string;
  commissionRateBps: number;
  commissionMinor: bigint;
  netTeacherMinor: bigint;
}

export interface CartQuote {
  items: CartLineQuote[];
  currency: string;
  totalMinor: bigint;
  teacherCount: number;
}

export class OrderRefusedError extends DomainError {
  readonly code = 'ORDER_REFUSED';
}

/**
 * Splits a course price into platform commission and teacher net earning in integer minor units.
 * Floor division on basis points ensures commissionMinor + netTeacherMinor === priceMinor always.
 */
export function computeLineSplit(
  priceMinor: bigint,
  commissionRateBps: number,
): { commissionMinor: bigint; netTeacherMinor: bigint } {
  if (priceMinor <= 0n) {
    throw new OrderRefusedError('Paid course price must be positive', {
      reason: 'INVALID_PRICE',
    });
  }
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10000) {
    throw new OrderRefusedError('Commission rate must be between 0 and 10000 bps', {
      reason: 'INVALID_COMMISSION_RATE',
    });
  }
  const commissionMinor = (priceMinor * BigInt(commissionRateBps)) / 10000n;
  const netTeacherMinor = priceMinor - commissionMinor;
  return { commissionMinor, netTeacherMinor };
}

/** Checks that a single course can be purchased by the buyer right now. */
export function assertCoursePurchasable(
  course: PurchasableCourseFacts,
  buyerId: string,
  alreadyEnrolled: boolean,
): { priceMinor: bigint; currency: string; commissionRateBps: number } {
  if (course.status !== 'PUBLISHED' || course.audienceType !== 'STUDENT') {
    throw new OrderRefusedError('This course is not available for purchase', {
      courseId: course.id,
      reason: 'NOT_AVAILABLE',
    });
  }
  if (!course.teacherActive) {
    throw new OrderRefusedError('This course is not taking new enrollments', {
      courseId: course.id,
      reason: 'TEACHER_SUSPENDED',
    });
  }
  if (!course.isEnrollmentOpen) {
    throw new OrderRefusedError('Enrollment for this course is closed', {
      courseId: course.id,
      reason: 'ENROLLMENT_CLOSED',
    });
  }
  if (course.teacherId === buyerId) {
    throw new OrderRefusedError('You teach this course', {
      courseId: course.id,
      reason: 'OWN_COURSE',
    });
  }
  if (course.isFree) {
    throw new OrderRefusedError('This is a free course. Enrol directly without checkout.', {
      courseId: course.id,
      reason: 'FREE_COURSE',
    });
  }
  if (alreadyEnrolled) {
    throw new OrderRefusedError('You already have active access to this course', {
      courseId: course.id,
      reason: 'ALREADY_ENROLLED',
    });
  }
  if (
    course.priceMinor === null ||
    course.priceMinor <= 0n ||
    !course.currency ||
    course.commissionRateBps === null
  ) {
    throw new OrderRefusedError('This course does not have complete pricing', {
      courseId: course.id,
      reason: 'NOT_PRICED',
    });
  }
  return {
    priceMinor: course.priceMinor,
    currency: course.currency,
    commissionRateBps: course.commissionRateBps,
  };
}

/**
 * #54: validates a multi-teacher cart and computes the line splits and total in minor units.
 * Duplicate course ids in the input are collapsed in order of first appearance.
 */
export function buildCartQuote(
  requestedCourseIds: readonly string[],
  courses: readonly PurchasableCourseFacts[],
  buyerId: string,
  activeEnrolledCourseIds: ReadonlySet<string>,
): CartQuote {
  const uniqueIds = [...new Set(requestedCourseIds)];
  if (uniqueIds.length === 0) {
    throw new OrderRefusedError('Cart must contain at least one course', {
      reason: 'EMPTY_CART',
    });
  }

  const byId = new Map(courses.map((c) => [c.id, c]));
  const items: CartLineQuote[] = [];
  let cartCurrency: string | null = null;
  let totalMinor = 0n;

  for (const courseId of uniqueIds) {
    const course = byId.get(courseId);
    if (!course) {
      throw new OrderRefusedError('Course is not available for purchase', {
        courseId,
        reason: 'NOT_AVAILABLE',
      });
    }
    const priced = assertCoursePurchasable(course, buyerId, activeEnrolledCourseIds.has(course.id));
    if (cartCurrency === null) {
      cartCurrency = priced.currency;
    } else if (priced.currency !== cartCurrency) {
      throw new OrderRefusedError('All courses in one cart must use the same currency', {
        courseId: course.id,
        reason: 'CURRENCY_MISMATCH',
        expected: cartCurrency,
        actual: priced.currency,
      });
    }
    const { commissionMinor, netTeacherMinor } = computeLineSplit(
      priced.priceMinor,
      priced.commissionRateBps,
    );
    items.push({
      courseId: course.id,
      title: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      priceMinor: priced.priceMinor,
      currency: priced.currency,
      commissionRateBps: priced.commissionRateBps,
      commissionMinor,
      netTeacherMinor,
    });
    totalMinor += priced.priceMinor;
  }

  const teacherCount = new Set(items.map((item) => item.teacherId)).size;
  return {
    items,
    currency: cartCurrency!,
    totalMinor,
    teacherCount,
  };
}
