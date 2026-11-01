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
export interface DuplicateTransactionMatch {
  orderId: string;
  paymentReference: string;
  transactionId: string;
}

export interface DuplicateTransactionIdWarning {
  transactionId: string;
  conflictingOrderIds: string[];
  conflictingPaymentReferences: string[];
  message: string;
}

/**
 * #59: detects when a bank transaction ID has already been submitted on another order.
 * Returns a non-blocking warning (or null if no other order uses the same transaction ID).
 */
export function buildDuplicateTransactionIdWarning(
  currentOrderId: string,
  transactionId: string,
  matches: readonly DuplicateTransactionMatch[],
): DuplicateTransactionIdWarning | null {
  const normalized = transactionId.trim().toLowerCase();
  const otherOrders = matches.filter(
    (m) => m.orderId !== currentOrderId && m.transactionId.trim().toLowerCase() === normalized,
  );
  if (otherOrders.length === 0) return null;

  const conflictingOrderIds = [...new Set(otherOrders.map((m) => m.orderId))];
  const conflictingPaymentReferences = [...new Set(otherOrders.map((m) => m.paymentReference))];
  return {
    transactionId,
    conflictingOrderIds,
    conflictingPaymentReferences,
    message: `Transaction ID "${transactionId}" also appears on ${conflictingOrderIds.length} other order(s) (${conflictingPaymentReferences.join(', ')}).`,
  };
}
export type StudentOrderActionRequired = 'SUBMIT_PROOF' | 'AWAIT_ADMIN_VERIFICATION' | 'NONE';

export interface StudentOrderStatusGuidance {
  statusLabel: string;
  actionRequired: StudentOrderActionRequired;
  canSubmitProof: boolean;
  nextStepMessage: string;
}

/**
 * #60: describes the current status of a student's order and what is expected of them next.
 */
export function describeStudentOrderNextStep(input: {
  status: OrderStatusValue;
  paymentReference: string;
  totalMinor: bigint;
  currency: string;
  expiresAt: Date | null;
  proofCount: number;
}): StudentOrderStatusGuidance {
  switch (input.status) {
    case 'PENDING': {
      const expirySuffix = input.expiresAt ? ` before ${input.expiresAt.toISOString()}` : '';
      if (input.proofCount > 0) {
        return {
          statusLabel: 'Additional Payment Required',
          actionRequired: 'SUBMIT_PROOF',
          canSubmitProof: true,
          nextStepMessage: `An additional payment is required for order ${input.paymentReference}. Please transfer the remaining balance with reference ${input.paymentReference} and submit your new transaction ID and proof of payment${expirySuffix}.`,
        };
      }
      return {
        statusLabel: 'Awaiting Payment & Proof',
        actionRequired: 'SUBMIT_PROOF',
        canSubmitProof: true,
        nextStepMessage: `Transfer ${input.currency} ${input.totalMinor.toString()} (minor units) to the receiving bank account using payment reference ${input.paymentReference}${expirySuffix}, then submit your bank transaction ID and proof of payment.`,
      };
    }
    case 'PROOF_SUBMITTED':
      return {
        statusLabel: 'Payment Proof Under Review',
        actionRequired: 'AWAIT_ADMIN_VERIFICATION',
        canSubmitProof: true,
        nextStepMessage:
          'We have received your proof of payment. An administrator is verifying your bank transfer; you will be enrolled and notified by email once confirmed. You may submit an additional proof if you made a split or top-up transfer.',
      };
    case 'VERIFIED':
      return {
        statusLabel: 'Confirmed',
        actionRequired: 'NONE',
        canSubmitProof: false,
        nextStepMessage:
          'Your payment has been confirmed and your courses are now unlocked in your library.',
      };
    case 'REJECTED':
      return {
        statusLabel: 'Payment Rejected',
        actionRequired: 'NONE',
        canSubmitProof: false,
        nextStepMessage:
          'Your payment proof could not be verified and this order is closed. Please check the rejection email for details or place a new order.',
      };
    case 'LAPSED':
      return {
        statusLabel: 'Order Expired',
        actionRequired: 'NONE',
        canSubmitProof: false,
        nextStepMessage:
          'This order expired because no payment proof was submitted within the payment window. Please place a new order if you still wish to enrol.',
      };
    case 'REFUNDED':
      return {
        statusLabel: 'Refunded',
        actionRequired: 'NONE',
        canSubmitProof: false,
        nextStepMessage:
          'This order has been refunded and access to the associated courses has been revoked.',
      };
  }
}
export interface OrderReceiptLineItem {
  id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string | null;
  priceMinor: bigint;
  currency: string;
}

export interface OrderReceipt {
  receiptNumber: string;
  orderId: string;
  paymentReference: string;
  issuedAt: Date;
  student: {
    id: string;
    fullName: string | null;
    email: string;
  };
  items: OrderReceiptLineItem[];
  totalMinor: bigint;
  currency: string;
  transactionIds: string[];
}

/**
 * #62: issues an official receipt for an order only after payment confirmation (`VERIFIED`).
 * Refuses unconfirmed orders so a receipt is never issued at checkout or before verification.
 */
export function buildOrderReceipt(order: {
  id: string;
  paymentReference: string;
  status: OrderStatusValue;
  verifiedAt: Date | null;
  totalMinor: bigint;
  currency: string;
  student: { id: string; fullName: string | null; email: string };
  items: OrderReceiptLineItem[];
  transactionIds: readonly string[];
}): OrderReceipt {
  if (order.status !== 'VERIFIED' || !order.verifiedAt) {
    throw new OrderRefusedError('A receipt is only issued after payment confirmation', {
      orderId: order.id,
      status: order.status,
      reason: 'NOT_VERIFIED',
    });
  }
  return {
    receiptNumber: `RCT-${order.paymentReference}`,
    orderId: order.id,
    paymentReference: order.paymentReference,
    issuedAt: order.verifiedAt,
    student: order.student,
    items: order.items,
    totalMinor: order.totalMinor,
    currency: order.currency,
    transactionIds: [...new Set(order.transactionIds)],
  };
}
