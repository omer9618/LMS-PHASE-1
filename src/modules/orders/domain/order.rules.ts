import { DomainError } from '../../../common/errors/domain.error';
import {
  assertCourseEnrollable,
  EnrollableCourseFacts,
  EnrollmentRefusedError,
} from '../../enrollment/domain/enrollment.rules';

/**
 * Cart and order rules (#54-#62). Pure: no Nest, no Prisma, no I/O.
 * All money is BigInt minor units; commission rates are integer basis points (10000 = 100%).
 */
export type OrderStatusValue =
  'PENDING' | 'PROOF_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'LAPSED' | 'REFUNDED';

export type OrderAction =
  'SUBMIT_PROOF' | 'CONFIRM' | 'REQUEST_TOP_UP' | 'REJECT' | 'LAPSE' | 'REFUND';

export type OrderAuditAction =
  | 'ORDER_PROOF_SUBMITTED'
  | 'ORDER_VERIFIED'
  | 'ORDER_TOP_UP_REQUESTED'
  | 'ORDER_REJECTED'
  | 'ORDER_LAPSED'
  | 'ORDER_REFUNDED';

interface TransitionSpec {
  from: readonly OrderStatusValue[];
  to: OrderStatusValue;
  auditAction: OrderAuditAction;
  /** The order gets a fresh payment window (now + ORDER_EXPIRY_WINDOW_HOURS). */
  restartsExpiry: boolean;
}

/**
 * #57: the order lifecycle.
 * - PENDING -> PROOF_SUBMITTED: the student submits a proof (#58). Further proofs on a
 *   PROOF_SUBMITTED order keep it there (split transfers, top-ups).
 * - REJECTED -> PROOF_SUBMITTED: a rejected proof can be resubmitted on the same order (decided).
 * - PROOF_SUBMITTED -> VERIFIED: an admin confirms payment (#64).
 * - PROOF_SUBMITTED -> REJECTED: an admin rejects the payment (#65). The expiry clock restarts.
 * - PROOF_SUBMITTED -> PENDING: an admin asks for a top-up of a short payment (#66). The order is
 *   awaiting proof again and the expiry clock restarts.
 * - PENDING or REJECTED -> LAPSED: the expiry job (#61). An order awaiting an admin never lapses.
 * - VERIFIED -> REFUNDED: refunds (M3). The rule exists; no endpoint uses it yet.
 * - LAPSED and REFUNDED are terminal.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderAction, TransitionSpec>> = {
  SUBMIT_PROOF: {
    from: ['PENDING', 'PROOF_SUBMITTED', 'REJECTED'],
    to: 'PROOF_SUBMITTED',
    auditAction: 'ORDER_PROOF_SUBMITTED',
    restartsExpiry: false,
  },
  CONFIRM: {
    from: ['PROOF_SUBMITTED'],
    to: 'VERIFIED',
    auditAction: 'ORDER_VERIFIED',
    restartsExpiry: false,
  },
  REQUEST_TOP_UP: {
    from: ['PROOF_SUBMITTED'],
    to: 'PENDING',
    auditAction: 'ORDER_TOP_UP_REQUESTED',
    restartsExpiry: true,
  },
  REJECT: {
    from: ['PROOF_SUBMITTED'],
    to: 'REJECTED',
    auditAction: 'ORDER_REJECTED',
    restartsExpiry: true,
  },
  LAPSE: {
    from: ['PENDING', 'REJECTED'],
    to: 'LAPSED',
    auditAction: 'ORDER_LAPSED',
    restartsExpiry: false,
  },
  REFUND: {
    from: ['VERIFIED'],
    to: 'REFUNDED',
    auditAction: 'ORDER_REFUNDED',
    restartsExpiry: false,
  },
};

/** Orders that still hold their courses: a student cannot order the same course again. */
export const OPEN_ORDER_STATUSES: readonly OrderStatusValue[] = [
  'PENDING',
  'PROOF_SUBMITTED',
  'REJECTED',
];

/** Orders the expiry job may lapse. */
export const LAPSABLE_ORDER_STATUSES = ORDER_TRANSITIONS.LAPSE.from;

export interface OrderTransitionResult {
  from: OrderStatusValue;
  to: OrderStatusValue;
  auditAction: OrderAuditAction;
  transitionedAt: Date;
  verifiedAt?: Date;
  expiresAt?: Date;
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

/** #61: the instant a payment window opened at `now` closes. */
export function computeOrderExpiry(now: Date, expiryWindowHours: number): Date {
  return new Date(now.getTime() + expiryWindowHours * 60 * 60 * 1000);
}

/**
 * #57: validates a transition and returns what changes: the new status, `verifiedAt` on
 * confirmation, and a fresh `expiresAt` when the transition restarts the payment window.
 */
export function transitionOrder(
  current: OrderStatusValue,
  action: OrderAction,
  now: Date,
  expiryWindowHours?: number,
): OrderTransitionResult {
  const spec = ORDER_TRANSITIONS[action];
  if (!spec.from.includes(current)) {
    throw new InvalidOrderTransitionError(current, action);
  }
  if (spec.restartsExpiry && expiryWindowHours === undefined) {
    throw new Error(`${action} restarts the expiry clock and needs the expiry window`);
  }
  return {
    from: current,
    to: spec.to,
    auditAction: spec.auditAction,
    transitionedAt: now,
    ...(spec.to === 'VERIFIED' ? { verifiedAt: now } : {}),
    ...(spec.restartsExpiry ? { expiresAt: computeOrderExpiry(now, expiryWindowHours!) } : {}),
  };
}

/** #61: whether the expiry job should lapse this order now. */
export function isOrderDueToLapse(
  order: { status: OrderStatusValue; expiresAt: Date | null },
  now: Date,
): boolean {
  return (
    LAPSABLE_ORDER_STATUSES.includes(order.status) &&
    order.expiresAt !== null &&
    order.expiresAt.getTime() <= now.getTime()
  );
}

// ── Payment reference (#55) ─────────────────────────────────────────

/**
 * Crockford base32: digits and uppercase letters without I, L, O and U, so a reference read out
 * over the phone or typed into a bank app cannot be confused. 32 symbols: one byte mod 32 is
 * unbiased.
 */
export const PAYMENT_REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAYMENT_REFERENCE_PATTERN = /^LMS-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** #55: `LMS-XXXX-XXXX` from 8 random bytes (40 bits). The service retries on collision. */
export function formatPaymentReference(randomBytes: Uint8Array): string {
  if (randomBytes.length < 8) {
    throw new Error('formatPaymentReference needs at least 8 random bytes');
  }
  let symbols = '';
  for (let i = 0; i < 8; i += 1) {
    symbols += PAYMENT_REFERENCE_ALPHABET[randomBytes[i]! % 32];
  }
  return `LMS-${symbols.slice(0, 4)}-${symbols.slice(4)}`;
}

// ── Money (#56) ────────────────────────────────────────────────────

export class OrderRefusedError extends DomainError {
  readonly code = 'ORDER_REFUSED';
}

/**
 * #56: splits a price into platform commission and teacher net, in minor units.
 * Commission = price x bps / 10000, rounded half-up; net = price - commission, so the two always
 * add back to the price exactly.
 */
export function computeLineSplit(
  priceMinor: bigint,
  commissionRateBps: number,
): { commissionMinor: bigint; netTeacherMinor: bigint } {
  if (priceMinor <= 0n) {
    throw new OrderRefusedError('Paid course price must be positive', { reason: 'INVALID_PRICE' });
  }
  if (!Number.isInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10000) {
    throw new OrderRefusedError('Commission rate must be between 0 and 10000 bps', {
      reason: 'INVALID_COMMISSION_RATE',
    });
  }
  const commissionMinor = (priceMinor * BigInt(commissionRateBps) + 5000n) / 10000n;
  return { commissionMinor, netTeacherMinor: priceMinor - commissionMinor };
}

/** ISO 4217 minor-unit exponents that are not 2. Explicit, so ICU versions cannot change it. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Decimal places of a currency's minor unit (ISO 4217); 2 unless listed above. */
export function currencyExponent(currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return 2;
}

/** #112: amounts in emails. "PKR 1,500.00" from minor units, in the currency's ISO 4217 decimals. */
export function formatAmount(minor: bigint, currency: string): string {
  const digits = currencyExponent(currency);
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, '0');
  const major = abs.slice(0, abs.length - digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = digits > 0 ? `.${abs.slice(abs.length - digits)}` : '';
  return `${negative ? '-' : ''}${currency} ${major}${fraction}`;
}

// ── Cart (#54) ─────────────────────────────────────────────────────

/** #11: a student must verify their email before placing a paid order. */
export class EmailNotVerifiedError extends DomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';
}

export function assertEmailVerifiedForOrder(isEmailVerified: boolean): void {
  if (!isEmailVerified) {
    throw new EmailNotVerifiedError('Please verify your email address before buying a course');
  }
}

export interface PurchasableCourseFacts extends EnrollableCourseFacts {
  id: string;
  title: string;
  priceMinor: bigint | null;
  currency: string | null;
  commissionRateBps: number | null;
  teacherName: string | null;
}

export interface BuyerFacts {
  buyerId: string;
  /** Courses the buyer has active access to now. */
  activeCourseIds: ReadonlySet<string>;
  /** Courses already in one of the buyer's open orders (PENDING, PROOF_SUBMITTED, REJECTED). */
  openOrderCourseIds: ReadonlySet<string>;
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

function refuse(courseId: string, message: string, reason: string): never {
  throw new OrderRefusedError(message, { courseId, reason });
}

/** Checks that one course can be bought by this buyer now and returns its sale terms. */
export function assertCoursePurchasable(
  course: PurchasableCourseFacts,
  buyer: BuyerFacts,
): { priceMinor: bigint; currency: string; commissionRateBps: number } {
  try {
    assertCourseEnrollable(course);
  } catch (error) {
    if (error instanceof EnrollmentRefusedError) {
      throw new OrderRefusedError(error.message, {
        ...(error.info as object),
        courseId: course.id,
      });
    }
    throw error;
  }
  if (course.teacherId === buyer.buyerId) {
    refuse(course.id, 'You teach this course', 'OWN_COURSE');
  }
  if (course.isFree) {
    refuse(course.id, 'This is a free course. Enroll directly without checkout.', 'FREE_COURSE');
  }
  if (buyer.activeCourseIds.has(course.id)) {
    refuse(course.id, 'You already have access to this course', 'ALREADY_ENROLLED');
  }
  if (buyer.openOrderCourseIds.has(course.id)) {
    refuse(course.id, 'This course is already in one of your open orders', 'IN_OPEN_ORDER');
  }
  if (
    course.priceMinor === null ||
    course.priceMinor <= 0n ||
    !course.currency ||
    course.commissionRateBps === null
  ) {
    refuse(course.id, 'This course has no price yet', 'NOT_PRICED');
  }
  return {
    priceMinor: course.priceMinor,
    currency: course.currency,
    commissionRateBps: course.commissionRateBps,
  };
}

/**
 * #54: validates a cart (courses from any number of teachers, one currency) and computes each
 * line's split and the total. Duplicate ids collapse, keeping the first position.
 */
export function buildCartQuote(
  requestedCourseIds: readonly string[],
  courses: readonly PurchasableCourseFacts[],
  buyer: BuyerFacts,
): CartQuote {
  const uniqueIds = [...new Set(requestedCourseIds)];
  if (uniqueIds.length === 0) {
    throw new OrderRefusedError('Your cart is empty', { reason: 'EMPTY_CART' });
  }
  const byId = new Map(courses.map((c) => [c.id, c]));
  const items: CartLineQuote[] = [];
  let currency: string | null = null;
  let totalMinor = 0n;

  for (const courseId of uniqueIds) {
    const course = byId.get(courseId);
    if (!course) refuse(courseId, 'This course is not available for purchase', 'NOT_AVAILABLE');
    const terms = assertCoursePurchasable(course, buyer);
    if (currency === null) {
      currency = terms.currency;
    } else if (terms.currency !== currency) {
      throw new OrderRefusedError('All courses in one order must be in the same currency', {
        courseId,
        reason: 'CURRENCY_MISMATCH',
        expected: currency,
        actual: terms.currency,
      });
    }
    const split = computeLineSplit(terms.priceMinor, terms.commissionRateBps);
    items.push({
      courseId,
      title: course.title,
      teacherId: course.teacherId,
      teacherName: course.teacherName,
      priceMinor: terms.priceMinor,
      currency: terms.currency,
      commissionRateBps: terms.commissionRateBps,
      ...split,
    });
    totalMinor += terms.priceMinor;
  }

  return {
    items,
    currency: currency!,
    totalMinor,
    teacherCount: new Set(items.map((i) => i.teacherId)).size,
  };
}

// ── Payment instructions (#55) ─────────────────────────────────────

export interface PaymentInstructions {
  /** Bank account and transfer steps, from the BANK_TRANSFER_INSTRUCTIONS setting. */
  bankTransferInstructions: string;
  paymentReference: string;
  amountMinor: bigint;
  currency: string;
  expiresAt: Date | null;
  verificationTurnaroundHours: number;
}

export function buildPaymentInstructions(
  order: { paymentReference: string; totalMinor: bigint; currency: string; expiresAt: Date | null },
  bankTransferInstructions: string,
  verificationTurnaroundHours: number,
): PaymentInstructions {
  return {
    bankTransferInstructions,
    paymentReference: order.paymentReference,
    amountMinor: order.totalMinor,
    currency: order.currency,
    expiresAt: order.expiresAt,
    verificationTurnaroundHours,
  };
}

// ── Duplicate transaction ids (#59) ────────────────────────────────

export function normaliseTransactionId(transactionId: string): string {
  return transactionId.trim().toLowerCase();
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
 * #59: a warning (never a refusal) when a transaction id was also submitted on another order.
 * Matching ignores case and surrounding spaces.
 */
export function buildDuplicateTransactionIdWarning(
  currentOrderId: string,
  transactionId: string,
  matches: readonly DuplicateTransactionMatch[],
): DuplicateTransactionIdWarning | null {
  const wanted = normaliseTransactionId(transactionId);
  const others = matches.filter(
    (m) => m.orderId !== currentOrderId && normaliseTransactionId(m.transactionId) === wanted,
  );
  if (others.length === 0) return null;
  const conflictingOrderIds = [...new Set(others.map((m) => m.orderId))];
  const conflictingPaymentReferences = [...new Set(others.map((m) => m.paymentReference))];
  return {
    transactionId,
    conflictingOrderIds,
    conflictingPaymentReferences,
    message: `Transaction ID "${transactionId}" was also submitted on ${conflictingPaymentReferences.join(', ')}.`,
  };
}

/** #59: one warning per distinct transaction id on the order. */
export function buildDuplicateTransactionIdWarnings(
  orderId: string,
  transactionIds: readonly string[],
  matches: readonly DuplicateTransactionMatch[],
): DuplicateTransactionIdWarning[] {
  const seen = new Set<string>();
  const warnings: DuplicateTransactionIdWarning[] = [];
  for (const id of transactionIds) {
    const key = normaliseTransactionId(id);
    if (seen.has(key)) continue;
    seen.add(key);
    const warning = buildDuplicateTransactionIdWarning(orderId, id, matches);
    if (warning) warnings.push(warning);
  }
  return warnings;
}

// ── Student status screen (#60) ────────────────────────────────────

export type StudentNextAction = 'SUBMIT_PROOF' | 'WAIT_FOR_VERIFICATION' | 'NONE';

/** The admin's most recent decision that did not confirm the order, if it is still current. */
export type LastPaymentDecision =
  | { kind: 'REJECTED'; reason: string; notes: string | null }
  | { kind: 'TOP_UP_REQUESTED'; shortfallMinor: bigint };

export interface StudentOrderGuidance {
  statusLabel: string;
  nextAction: StudentNextAction;
  canSubmitProof: boolean;
  whatHappensNext: string;
}

/** #60: the order's status in the student's words and what they should do next. */
export function describeStudentOrderNextStep(input: {
  status: OrderStatusValue;
  paymentReference: string;
  totalMinor: bigint;
  currency: string;
  expiresAt: Date | null;
  verificationTurnaroundHours: number;
  lastDecision: LastPaymentDecision | null;
}): StudentOrderGuidance {
  const deadline = input.expiresAt ? ` by ${input.expiresAt.toISOString()}` : '';
  switch (input.status) {
    case 'PENDING':
      if (input.lastDecision?.kind === 'TOP_UP_REQUESTED') {
        return {
          statusLabel: 'Top-up required',
          nextAction: 'SUBMIT_PROOF',
          canSubmitProof: true,
          whatHappensNext: `We received less than the order total. Transfer the remaining ${input.currency} ${input.lastDecision.shortfallMinor.toString()} (minor units) with reference ${input.paymentReference}${deadline}, then submit the new transaction ID.`,
        };
      }
      return {
        statusLabel: 'Awaiting payment',
        nextAction: 'SUBMIT_PROOF',
        canSubmitProof: true,
        whatHappensNext: `Transfer ${input.currency} ${input.totalMinor.toString()} (minor units) using the bank details and reference ${input.paymentReference}${deadline}, then submit your transaction ID. Unpaid orders expire after that.`,
      };
    case 'PROOF_SUBMITTED':
      return {
        statusLabel: 'Payment under review',
        nextAction: 'WAIT_FOR_VERIFICATION',
        canSubmitProof: true,
        whatHappensNext: `We are checking your transfer, usually within ${input.verificationTurnaroundHours} hours. You will get an email and access to your courses once it is confirmed. If you made more than one transfer, add each transaction ID.`,
      };
    case 'VERIFIED':
      return {
        statusLabel: 'Paid',
        nextAction: 'NONE',
        canSubmitProof: false,
        whatHappensNext:
          'Your payment is confirmed and your courses are in your library. Your receipt is available.',
      };
    case 'REJECTED': {
      const reason =
        input.lastDecision?.kind === 'REJECTED'
          ? ` Reason: ${input.lastDecision.reason}${input.lastDecision.notes ? ` (${input.lastDecision.notes})` : ''}.`
          : '';
      return {
        statusLabel: 'Payment not accepted',
        nextAction: 'SUBMIT_PROOF',
        canSubmitProof: true,
        whatHappensNext: `We could not verify your payment.${reason} Submit a corrected transaction ID or proof on this order${deadline}, or it will expire.`,
      };
    }
    case 'LAPSED':
      return {
        statusLabel: 'Expired',
        nextAction: 'NONE',
        canSubmitProof: false,
        whatHappensNext:
          'This order expired before a payment was received. Place a new order if you still want these courses.',
      };
    case 'REFUNDED':
      return {
        statusLabel: 'Refunded',
        nextAction: 'NONE',
        canSubmitProof: false,
        whatHappensNext: 'This order was refunded.',
      };
  }
}

/** #65: the rejection reasons in the words a student reads. */
export const REJECTION_REASON_LABELS: Readonly<Record<string, string>> = {
  NO_PAYMENT_RECEIVED: 'No payment was received for this order',
  AMOUNT_SHORT: 'The amount received was less than the order total',
  INVALID_TRANSACTION_ID: 'The transaction ID could not be matched to a transfer',
  DUPLICATE_TRANSACTION: 'This transaction was already used for another order',
  OTHER: 'The payment could not be verified',
};

export interface PaymentDecisionFacts {
  outcome: 'CONFIRMED' | 'REJECTED';
  mismatchAction: 'CONFIRM_ANYWAY' | 'REQUEST_TOP_UP' | 'REJECT' | null;
  rejectionReason: string | null;
  notes: string | null;
  amountReceivedMinor: bigint | null;
}

/**
 * #60, #65, #66: what the admin last decided about the order, if it did not confirm it.
 * `verifications` are in chronological order.
 */
export function lastPaymentDecision(
  totalMinor: bigint,
  verifications: readonly PaymentDecisionFacts[],
): LastPaymentDecision | null {
  const last = verifications.at(-1);
  if (!last || last.outcome !== 'REJECTED') return null;
  if (last.mismatchAction === 'REQUEST_TOP_UP') {
    const received = last.amountReceivedMinor ?? 0n;
    return { kind: 'TOP_UP_REQUESTED', shortfallMinor: totalMinor - received };
  }
  return {
    kind: 'REJECTED',
    reason:
      REJECTION_REASON_LABELS[last.rejectionReason ?? 'OTHER'] ?? REJECTION_REASON_LABELS.OTHER!,
    notes: last.notes,
  };
}

// ── Receipt (#62) ──────────────────────────────────────────────────

export interface OrderReceiptLineItem {
  courseId: string;
  courseTitle: string;
  teacherName: string | null;
  priceMinor: bigint;
}

export interface OrderReceipt {
  receiptNumber: string;
  orderId: string;
  paymentReference: string;
  issuedAt: Date;
  student: { fullName: string | null; email: string };
  items: OrderReceiptLineItem[];
  totalMinor: bigint;
  currency: string;
}

/** #62: a receipt exists only for a confirmed (VERIFIED) order, never at checkout. */
export function buildOrderReceipt(order: {
  id: string;
  paymentReference: string;
  status: OrderStatusValue;
  verifiedAt: Date | null;
  totalMinor: bigint;
  currency: string;
  student: { fullName: string | null; email: string };
  items: OrderReceiptLineItem[];
}): OrderReceipt {
  if (order.status !== 'VERIFIED' || !order.verifiedAt) {
    throw new OrderRefusedError('A receipt is issued only once the payment is confirmed', {
      orderId: order.id,
      status: order.status,
      reason: 'NOT_VERIFIED',
    });
  }
  return {
    receiptNumber: `RCT-${order.paymentReference.slice(4)}`,
    orderId: order.id,
    paymentReference: order.paymentReference,
    issuedAt: order.verifiedAt,
    student: order.student,
    items: order.items,
    totalMinor: order.totalMinor,
    currency: order.currency,
  };
}
