import { DomainError } from '../../../common/errors/domain.error';

/**
 * Cart and order rules (#54, #55, #56, #57). Pure: no Nest, no Prisma, no I/O.
 * All money is BigInt minor units; commission rates are integer basis points (10000 = 100%).
 */
export type OrderStatusValue =
  'PENDING' | 'PROOF_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'LAPSED' | 'REFUNDED';

export type OrderAction =
  'SUBMIT_PROOF' | 'VERIFY' | 'REQUEST_TOP_UP' | 'REJECT' | 'LAPSE' | 'REFUND';

export type OrderAuditAction =
  | 'ORDER_CREATED'
  | 'ORDER_PROOF_SUBMITTED'
  | 'ORDER_VERIFIED'
  | 'ORDER_TOP_UP_REQUESTED'
  | 'ORDER_REJECTED'
  | 'ORDER_LAPSED'
  | 'ORDER_REFUNDED';

/**
 * #57: Order lifecycle state machine.
 * - PENDING -> PROOF_SUBMITTED when the student submits payment proof (#58). Multiple proofs on a
 *   PROOF_SUBMITTED order keep it in PROOF_SUBMITTED.
 * - PENDING -> LAPSED when the expiry window passes without proof (#61). Once proof is submitted,
 *   the order is waiting on an admin and never lapses by timer.
 * - PROOF_SUBMITTED -> VERIFIED when an admin confirms payment (#64).
 * - PROOF_SUBMITTED -> PENDING when an admin requests a top-up for a short payment (#66), allowing
 *   the student to submit an additional proof.
 * - PROOF_SUBMITTED -> REJECTED when an admin rejects payment (#65).
 * - VERIFIED -> REFUNDED when an admin records a refund (#82).
 * - REJECTED, LAPSED and REFUNDED are terminal.
 */
export const ORDER_TRANSITIONS: Readonly<
  Record<
    OrderAction,
    {
      from: readonly OrderStatusValue[];
      to: OrderStatusValue;
      auditAction: OrderAuditAction;
    }
  >
> = {
  SUBMIT_PROOF: {
    from: ['PENDING', 'PROOF_SUBMITTED'],
    to: 'PROOF_SUBMITTED',
    auditAction: 'ORDER_PROOF_SUBMITTED',
  },
  VERIFY: {
    from: ['PROOF_SUBMITTED'],
    to: 'VERIFIED',
    auditAction: 'ORDER_VERIFIED',
  },
  REQUEST_TOP_UP: {
    from: ['PROOF_SUBMITTED'],
    to: 'PENDING',
    auditAction: 'ORDER_TOP_UP_REQUESTED',
  },
  REJECT: {
    from: ['PROOF_SUBMITTED'],
    to: 'REJECTED',
    auditAction: 'ORDER_REJECTED',
  },
  LAPSE: {
    from: ['PENDING'],
    to: 'LAPSED',
    auditAction: 'ORDER_LAPSED',
  },
  REFUND: {
    from: ['VERIFIED'],
    to: 'REFUNDED',
    auditAction: 'ORDER_REFUNDED',
  },
};

export interface OrderTransitionResult {
  from: OrderStatusValue;
  to: OrderStatusValue;
  auditAction: OrderAuditAction;
  transitionedAt: Date;
  verifiedAt?: Date;
}

export class InvalidOrderTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(from: OrderStatusValue, action: OrderAction) {
    super(`Cannot ${action.toLowerCase().replace(/_/g, ' ')} an order that is ${from}`, {
      from,
      action,
      allowedFrom: ORDER_TRANSITIONS[action].from,
    });
  }
}

/**
 * #57: validates and computes an order state transition, stamping the transition time (and
 * `verifiedAt` when transitioning to VERIFIED).
 */
export function transitionOrder(
  current: OrderStatusValue,
  action: OrderAction,
  now: Date,
): OrderTransitionResult {
  const spec = ORDER_TRANSITIONS[action];
  if (!spec.from.includes(current)) {
    throw new InvalidOrderTransitionError(current, action);
  }
  return {
    from: current,
    to: spec.to,
    auditAction: spec.auditAction,
    transitionedAt: now,
    ...(spec.to === 'VERIFIED' ? { verifiedAt: now } : {}),
  };
}

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

export interface BankAccountDetails {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
}

export interface PaymentInstructions {
  bank: BankAccountDetails;
  paymentReference: string;
  amountMinor: bigint;
  currency: string;
  expiresAt: Date | null;
  instructions: string;
}

/** Receiving bank account for manual bank transfers (#55; subject to client confirmation #127). */
export const RECEIVING_BANK_ACCOUNT: BankAccountDetails = {
  bankName: 'Meezan Bank',
  accountTitle: 'LMS Education Pvt Ltd',
  accountNumber: '01010105432101',
  iban: 'PK36MEZN0001010105432101',
};

/** Unambiguous uppercase alphanumeric alphabet (no 0/O or 1/I/L) for bank references. */
export const PAYMENT_REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export class OrderRefusedError extends DomainError {
  readonly code = 'ORDER_REFUSED';
}

export class EmailNotVerifiedError extends DomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';
}

/** #11 / #55: a student must verify their email address before creating a paid order. */
export function assertEmailVerifiedForOrder(isEmailVerified: boolean): void {
  if (!isEmailVerified) {
    throw new EmailNotVerifiedError('Please verify your email address before purchasing a course');
  }
}

/**
 * #55: formats a unique, human-readable payment reference (`LMS-YYYYMMDD-XXXXXX`) from a UTC date
 * and random bytes, using an unambiguous uppercase alphabet for bank transfer remarks.
 */
export function formatPaymentReference(now: Date, randomBytes: Uint8Array): string {
  if (randomBytes.length < 6) {
    throw new Error('formatPaymentReference requires at least 6 random bytes');
  }
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0');
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += PAYMENT_REFERENCE_ALPHABET[randomBytes[i]! % PAYMENT_REFERENCE_ALPHABET.length];
  }
  return `LMS-${yyyy}${mm}${dd}-${suffix}`;
}

/** #55 / #61: computes the UTC instant when a pending order lapses. */
export function computeOrderExpiry(now: Date, expiryWindowHours: number): Date {
  return new Date(now.getTime() + expiryWindowHours * 60 * 60 * 1000);
}

/** #55: builds the bank transfer instructions displayed on checkout and order status screens. */
export function buildPaymentInstructions(
  order: {
    paymentReference: string;
    totalMinor: bigint;
    currency: string;
    expiresAt: Date | null;
  },
  bank: BankAccountDetails = RECEIVING_BANK_ACCOUNT,
): PaymentInstructions {
  return {
    bank,
    paymentReference: order.paymentReference,
    amountMinor: order.totalMinor,
    currency: order.currency,
    expiresAt: order.expiresAt,
    instructions: `Transfer the exact amount and enter reference ${order.paymentReference} in the bank transfer remarks, then submit your transaction ID.`,
  };
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
