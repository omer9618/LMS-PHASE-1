import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserStatus } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope, TeacherScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { CourseService } from '../../courses/services/course.service';
import { EmailService } from '../../email/services/email.service';
import type { EmailTemplateData, EmailTemplateName } from '../../email/templates';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import {
  contentTypeForKey,
  IncomingFile,
  StorageService,
} from '../../storage/services/storage.service';
import { OrderDao, OrderItemRecord, OrderRecord, PaymentProofRecord, TeacherOrderItemRecord } from '../dao/order.dao';
import {
  assertEmailVerifiedForOrder,
  buildCartQuote,
  buildDuplicateTransactionIdWarning,
  buildDuplicateTransactionIdWarnings,
  buildOrderReceipt,
  buildPaymentInstructions,
  CartQuote,
  computeOrderExpiry,
  describeStudentOrderNextStep,
  DuplicateTransactionIdWarning,
  formatAmount,
  formatPaymentReference,
  isOrderDueToLapse,
  LAPSABLE_ORDER_STATUSES,
  lastPaymentDecision,
  LastPaymentDecision,
  OPEN_ORDER_STATUSES,
  OrderAction,
  OrderReceipt,
  OrderTransitionResult,
  PaymentInstructions,
  PurchasableCourseFacts,
  REJECTION_REASON_LABELS,
  StudentOrderGuidance,
  transitionOrder,
} from '../domain/order.rules';
import type {
  QuoteCartInput,
  CreateOrderInput,
  SubmitPaymentProofInput,
} from '../schemas/order.schema';

export type { DuplicateTransactionIdWarning, OrderItemRecord, OrderReceipt, OrderRecord, TeacherOrderItemRecord };

export interface CartQuoteView {
  items: Array<{
    courseId: string;
    title: string;
    teacherId: string;
    teacherName: string | null;
    priceMinor: bigint;
    currency: string;
  }>;
  currency: string;
  totalMinor: bigint;
  teacherCount: number;
}

export interface PaymentProofView {
  id: string;
  transactionId: string;
  amountClaimedMinor: bigint | null;
  hasFile: boolean;
  fileUrl: string | null;
  submittedAt: Date;
}

export interface StudentOrderView {
  id: string;
  paymentReference: string;
  status: OrderStatus;
  totalMinor: bigint;
  currency: string;
  createdAt: Date;
  expiresAt: Date | null;
  verifiedAt: Date | null;
  items: Array<{
    courseId: string;
    courseTitle: string;
    teacherName: string | null;
    priceMinor: bigint;
  }>;
  proofs: PaymentProofView[];
  paymentInstructions: PaymentInstructions;
  lastDecision: LastPaymentDecision | null;
  guidance: StudentOrderGuidance;
}

export interface SubmittedProofView {
  order: StudentOrderView;
  proof: PaymentProofView;
  /** #59: set when the same transaction id was submitted on another order. Never blocks. */
  duplicateTransactionIdWarning: DuplicateTransactionIdWarning | null;
}

export interface AdminOrderView extends Omit<OrderRecord, 'proofs'> {
  proofs: PaymentProofView[];
  duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[];
}

/**
 * Orders (#54-#62): cart quotes, order creation with frozen line snapshots, payment proofs,
 * the student's order screens, receipts and the expiry sweep. Its exported methods give the
 * verification module (#63-#67) the order reads, state transitions and student emails it needs.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly orderDao: OrderDao,
    private readonly courseService: CourseService,
    private readonly enrollmentAccess: EnrollmentAccessService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly transactions: TransactionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @InjectPinoLogger(OrderService.name) private readonly logger: PinoLogger,
  ) {}

  // â”€â”€ Student â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** #54: validates a cart and totals it. Commission is internal and never shown to students. */
  async quote(user: AuthUser, input: QuoteCartInput): Promise<CartQuoteView> {
    const quote = await this.quoteCart(user, input.courseIds);
    return {
      items: quote.items.map((item) => ({
        courseId: item.courseId,
        title: item.title,
        teacherId: item.teacherId,
        teacherName: item.teacherName,
        priceMinor: item.priceMinor,
        currency: item.currency,
      })),
      currency: quote.currency,
      totalMinor: quote.totalMinor,
      teacherCount: quote.teacherCount,
    };
  }

  /**
   * #55, #56: creates a PENDING order with a unique payment reference and a frozen price and
   * commission snapshot per line, then emails the bank transfer instructions. #11: the student's
   * email must be verified.
   */
  async createOrder(user: AuthUser, input: CreateOrderInput): Promise<StudentOrderView> {
    assertEmailVerifiedForOrder(user.isEmailVerified);
    const expiryHours = await this.platformSettings.get('ORDER_EXPIRY_WINDOW_HOURS');
    const now = new Date();

    const order = await this.transactions.run(async (tx) => {
      const quote = await this.quoteCart(user, input.courseIds, tx);
      const paymentReference = await this.uniquePaymentReference(tx);
      const created = await this.orderDao.createOrder(
        {
          studentId: user.id,
          paymentReference,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
          status: OrderStatus.PENDING,
          expiresAt: computeOrderExpiry(now, expiryHours),
          items: quote.items.map((item) => ({
            courseId: item.courseId,
            teacherId: item.teacherId,
            priceMinor: item.priceMinor,
            commissionRateBps: item.commissionRateBps,
            commissionMinor: item.commissionMinor,
            netTeacherMinor: item.netTeacherMinor,
          })),
        },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'ORDER_CREATED',
          entityType: 'order',
          entityId: created.id,
          details: {
            to: OrderStatus.PENDING,
            paymentReference,
            totalMinor: created.totalMinor.toString(),
            currency: created.currency,
            courseIds: created.items.map((item) => item.courseId),
          },
        },
        tx,
      );
      return created;
    });

    this.logger.info(
      { orderId: order.id, paymentReference: order.paymentReference, studentId: user.id },
      'Order created',
    );
    const view = await this.toStudentView(order);
    await this.sendOrderEmail(order, 'ORDER_CREATED', {
      paymentReference: order.paymentReference,
      amount: formatAmount(order.totalMinor, order.currency),
      courses: courseList(order),
      bankTransferInstructions: view.paymentInstructions.bankTransferInstructions,
      expiresAt: order.expiresAt?.toISOString() ?? '',
      orderUrl: this.orderUrl(order.id),
    });
    return view;
  }

  /** #60: the student's orders, newest first, each with status and what happens next. */
  async listMyOrders(user: AuthUser): Promise<StudentOrderView[]> {
    const orders = await this.orderDao.getOrdersBy({ studentId: user.id });
    return Promise.all(orders.map((order) => this.toStudentView(order)));
  }

  /** #60: one of the student's orders. Another student's order is 404. */
  async getMyOrder(user: AuthUser, orderId: string): Promise<StudentOrderView> {
    return this.toStudentView(await this.loadMyOrder(user, orderId));
  }

  /** #62: the receipt of a confirmed order. Refused (409) until the payment is confirmed. */
  async getMyReceipt(user: AuthUser, orderId: string): Promise<OrderReceipt> {
    return receiptFor(await this.loadMyOrder(user, orderId));
  }

  /**
   * #58, #59: records a payment proof (transaction id, optional file, optional claimed amount).
   * Any number of proofs per order. A transaction id already used on another order is returned
   * as a warning and flagged in the admin queue, never refused.
   */
  async submitProof(
    user: AuthUser,
    orderId: string,
    input: SubmitPaymentProofInput,
    file?: IncomingFile,
  ): Promise<SubmittedProofView> {
    const existing = await this.loadMyOrder(user, orderId);
    const now = new Date();
    // Check the transition before storing a file we would then have to delete.
    transitionOrder(existing.status, 'SUBMIT_PROOF', now);
    const stored = file ? await this.storage.store('PAYMENT_PROOF', 'payment-proofs', file) : null;

    let result: {
      order: OrderRecord;
      proof: PaymentProofRecord;
      warning: DuplicateTransactionIdWarning | null;
    };
    try {
      result = await this.transactions.run(async (tx) => {
        const order = await this.orderDao.getOrderBy({ id: orderId, studentId: user.id }, tx);
        if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
        const matches = await this.orderDao.getOtherOrderProofsByTransactionIds(
          order.id,
          [input.transactionId],
          tx,
        );
        const warning = buildDuplicateTransactionIdWarning(
          order.id,
          input.transactionId,
          matches.map(toMatch),
        );
        const proof = await this.orderDao.createPaymentProof(
          {
            orderId: order.id,
            transactionId: input.transactionId,
            proofFileUrl: stored?.key ?? null,
            amountClaimedMinor: input.amountClaimedMinor ?? null,
          },
          tx,
        );
        await this.transition(
          order,
          'SUBMIT_PROOF',
          user.id,
          {
            proofId: proof.id,
            transactionId: proof.transactionId,
            hasFile: stored !== null,
            amountClaimedMinor: proof.amountClaimedMinor?.toString() ?? null,
            duplicateOfOrderIds: warning?.conflictingOrderIds ?? [],
          },
          now,
          tx,
        );
        const updated = await this.orderDao.getOrderBy({ id: order.id }, tx);
        return { order: updated!, proof, warning };
      });
    } catch (error) {
      if (stored) await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }

    this.logger.info(
      {
        orderId,
        proofId: result.proof.id,
        duplicateTransactionId: result.warning !== null,
      },
      'Payment proof submitted',
    );
    const turnaround = await this.platformSettings.get('VERIFICATION_TURNAROUND_HOURS');
    await this.sendOrderEmail(result.order, 'PAYMENT_PROOF_RECEIVED', {
      paymentReference: result.order.paymentReference,
      transactionId: result.proof.transactionId,
      turnaroundHours: turnaround,
      orderUrl: this.orderUrl(orderId),
    });
    return {
      order: await this.toStudentView(result.order),
      proof: await this.toProofView(result.proof),
      duplicateTransactionIdWarning: result.warning,
    };
  }

  // â”€â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Admin order detail: frozen line snapshots, proofs, decisions and duplicate warnings. */
  async getOrderForAdmin(admin: AuthUser, orderId: string): Promise<AdminOrderView> {
    adminScope(admin);
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
    const warnings = await this.duplicateWarnings([order]);
    return {
      ...order,
      proofs: await Promise.all(order.proofs.map((p) => this.toProofView(p))),
      duplicateTransactionIdWarnings: warnings.get(order.id) ?? [],
    };
  }

  // â”€â”€ Expiry job (#61) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * #61: lapses every PENDING or REJECTED order past its window, each in its own transaction with
   * an ORDER_LAPSED audit entry (no actor), then emails the student. Returns how many lapsed.
   */
  async expireDueOrders(now = new Date()): Promise<number> {
    const ids = await this.orderDao.getOrderIdsBy({
      status: { in: [...LAPSABLE_ORDER_STATUSES] as OrderStatus[] },
      expiresAt: { lte: now },
    });
    let lapsed = 0;
    for (const id of ids) {
      try {
        const order = await this.transactions.run(async (tx) => {
          const current = await this.orderDao.getOrderBy({ id }, tx);
          if (!current || !isOrderDueToLapse(current, now)) return null;
          await this.transition(
            current,
            'LAPSE',
            null,
            { expiresAt: current.expiresAt!.toISOString() },
            now,
            tx,
          );
          return current;
        });
        if (!order) continue;
        lapsed += 1;
        this.logger.info({ orderId: id, paymentReference: order.paymentReference }, 'Order lapsed');
        await this.sendOrderEmail(order, 'ORDER_LAPSED', {
          paymentReference: order.paymentReference,
          amount: formatAmount(order.totalMinor, order.currency),
          courses: courseList(order),
          catalogueUrl: this.email.appUrl('/courses'),
        });
      } catch (err) {
        // One bad order must not stop the sweep; it is retried on the next run.
        this.logger.error({ err, orderId: id }, 'Failed to lapse order');
      }
    }
    return lapsed;
  }

  // â”€â”€ For the verification module (#63-#67) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** #63: every order awaiting an admin's decision. */
  listAwaitingVerification(): Promise<OrderRecord[]> {
    return this.orderDao.getOrdersBy({ status: OrderStatus.PROOF_SUBMITTED });
  }

  /** #64-#66: an order loaded inside the decision's transaction. */
  async getOrderInTransaction(orderId: string, tx: TransactionClient): Promise<OrderRecord> {
    const order = await this.orderDao.getOrderBy({ id: orderId }, tx);
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
    return order;
  }

  /** #59, #63: duplicate transaction id warnings for each order, keyed by order id. */
  async duplicateWarnings(
    orders: readonly OrderRecord[],
  ): Promise<Map<string, DuplicateTransactionIdWarning[]>> {
    const result = new Map<string, DuplicateTransactionIdWarning[]>();
    for (const order of orders) {
      const transactionIds = order.proofs.map((p) => p.transactionId);
      const matches = await this.orderDao.getOtherOrderProofsByTransactionIds(
        order.id,
        transactionIds,
      );
      result.set(
        order.id,
        buildDuplicateTransactionIdWarnings(order.id, transactionIds, matches.map(toMatch)),
      );
    }
    return result;
  }

  /** A proof with a short-lived download link, for the order's owner or an admin. */
  toProofView(proof: PaymentProofRecord): Promise<PaymentProofView> {
    return this.proofView(proof);
  }

  /**
   * #57: applies a transition inside the caller's transaction: checks it against the state
   * machine, updates the row only if it is still in the expected status (409 otherwise), and
   * writes an audit entry with the actor (null for jobs), time and from/to states.
   */
  async transition(
    order: { id: string; status: OrderStatus },
    action: OrderAction,
    actorUserId: string | null,
    details: Prisma.InputJsonObject,
    now: Date,
    tx: TransactionClient,
  ): Promise<OrderTransitionResult> {
    const expiryHours =
      action === 'REJECT' || action === 'REQUEST_TOP_UP'
        ? await this.platformSettings.get('ORDER_EXPIRY_WINDOW_HOURS')
        : undefined;
    const change = transitionOrder(order.status, action, now, expiryHours);
    const updated = await this.orderDao.updateOrderStatusIfCurrent(
      order.id,
      order.status,
      {
        status: change.to as OrderStatus,
        ...(change.verifiedAt ? { verifiedAt: change.verifiedAt } : {}),
        ...(change.expiresAt ? { expiresAt: change.expiresAt } : {}),
      },
      tx,
    );
    if (!updated) {
      throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
        orderId: order.id,
        action,
        reason: 'The order changed while this action was in progress',
      });
    }
    await this.audit.record(
      {
        actorUserId,
        action: change.auditAction,
        entityType: 'order',
        entityId: order.id,
        details: {
          from: change.from,
          to: change.to,
          at: now.toISOString(),
          ...(change.expiresAt ? { expiresAt: change.expiresAt.toISOString() } : {}),
          ...details,
        },
      },
      tx,
    );
    return change;
  }

  /**
   * #64, #62, #112: after a confirmation commits, emails the confirmation, the receipt and the
   * enrollment notice. Best-effort: a failed email is logged, never undoes the confirmation.
   */
  async notifyOrderVerified(orderId: string): Promise<void> {
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) return;
    const amount = formatAmount(order.totalMinor, order.currency);
    await this.sendOrderEmail(order, 'PAYMENT_CONFIRMED', {
      paymentReference: order.paymentReference,
      amount,
      orderUrl: this.orderUrl(order.id),
    });
    const receipt = receiptFor(order);
    await this.sendOrderEmail(order, 'ORDER_RECEIPT', {
      receiptNumber: receipt.receiptNumber,
      paymentReference: receipt.paymentReference,
      issuedAt: receipt.issuedAt.toISOString(),
      lines: receipt.items.map(
        (item) =>
          [item.courseTitle, formatAmount(item.priceMinor, order.currency)] as [string, string],
      ),
      total: amount,
      receiptUrl: this.email.appUrl(`/orders/${order.id}/receipt`),
    });
    await this.sendOrderEmail(order, 'ENROLLMENT_GRANTED', {
      courses: courseList(order),
      libraryUrl: this.email.appUrl('/my-courses'),
    });
  }

  /** #65: emails the student why their payment was not accepted and how to resubmit. */
  async notifyOrderRejected(orderId: string, reason: string, notes: string | null): Promise<void> {
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) return;
    await this.sendOrderEmail(order, 'PAYMENT_REJECTED', {
      paymentReference: order.paymentReference,
      reason: REJECTION_REASON_LABELS[reason] ?? REJECTION_REASON_LABELS.OTHER!,
      notes: notes ?? '',
      expiresAt: order.expiresAt?.toISOString() ?? '',
      orderUrl: this.orderUrl(order.id),
    });
  }

  /** #66: emails the student the shortfall to transfer. */
  async notifyTopUpRequested(orderId: string, shortfallMinor: bigint): Promise<void> {
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) return;
    await this.sendOrderEmail(order, 'PAYMENT_TOP_UP_REQUESTED', {
      paymentReference: order.paymentReference,
      total: formatAmount(order.totalMinor, order.currency),
      shortfall: formatAmount(shortfallMinor, order.currency),
      expiresAt: order.expiresAt?.toISOString() ?? '',
      orderUrl: this.orderUrl(order.id),
    });
  }

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** #54: loads sale facts, the buyer's access and open orders, and asks the rules. */
  private async quoteCart(
    user: AuthUser,
    requestedCourseIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<CartQuote> {
    const ids = [...new Set(requestedCourseIds)];
    const courses = await this.courseService.getSaleFacts(ids, tx);
    const found = new Set(courses.map((c) => c.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id: missing });

    const [activeFlags, openOrderCourseIds] = await Promise.all([
      Promise.all(ids.map((id) => this.enrollmentAccess.hasActiveEnrollment(user.id, id))),
      this.orderDao.getOrderedCourseIds(user.id, ids, OPEN_ORDER_STATUSES as OrderStatus[], tx),
    ]);
    const facts: PurchasableCourseFacts[] = courses.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      audienceType: c.audienceType,
      isFree: c.isFree,
      isEnrollmentOpen: c.isEnrollmentOpen,
      priceMinor: c.priceMinor,
      currency: c.currency,
      commissionRateBps: c.commissionRateBps,
      teacherId: c.teacherId,
      teacherName: c.teacher.fullName,
      teacherActive: c.teacher.status === UserStatus.ACTIVE,
    }));
    return buildCartQuote(ids, facts, {
      buyerId: user.id,
      activeCourseIds: new Set(ids.filter((_, i) => activeFlags[i])),
      openOrderCourseIds: new Set(openOrderCourseIds),
    });
  }

  private async loadMyOrder(user: AuthUser, orderId: string): Promise<OrderRecord> {
    const order = await this.orderDao.getOrderBy({ id: orderId, studentId: user.id });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
    return order;
  }

  /** #55: a fresh reference; retried on the (40-bit) chance of a collision. */
  private async uniquePaymentReference(tx: TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = formatPaymentReference(randomBytes(8));
      if (!(await this.orderDao.getOrderBy({ paymentReference: candidate }, tx))) return candidate;
    }
    throw new AppException(ErrorCode.INTERNAL, undefined, undefined, {
      message: 'Could not generate a unique payment reference',
    });
  }

  private async proofView(proof: PaymentProofRecord): Promise<PaymentProofView> {
    const key = proof.proofFileUrl;
    return {
      id: proof.id,
      transactionId: proof.transactionId,
      amountClaimedMinor: proof.amountClaimedMinor,
      hasFile: key !== null,
      fileUrl: key
        ? await this.storage.downloadUrl(
            key,
            `payment-proof-${proof.id}.${key.split('.').pop()}`,
            contentTypeForKey(key),
          )
        : null,
      submittedAt: proof.submittedAt,
    };
  }

  private async toStudentView(order: OrderRecord): Promise<StudentOrderView> {
    const [bankTransferInstructions, turnaround, proofs] = await Promise.all([
      this.platformSettings.get('BANK_TRANSFER_INSTRUCTIONS'),
      this.platformSettings.get('VERIFICATION_TURNAROUND_HOURS'),
      Promise.all(order.proofs.map((p) => this.proofView(p))),
    ]);
    const decision = lastPaymentDecision(order.totalMinor, order.verifications);
    return {
      id: order.id,
      paymentReference: order.paymentReference,
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      verifiedAt: order.verifiedAt,
      items: order.items.map((item) => ({
        courseId: item.courseId,
        courseTitle: item.course.title,
        teacherName: item.teacher.fullName,
        priceMinor: item.priceMinor,
      })),
      proofs,
      paymentInstructions: buildPaymentInstructions(order, bankTransferInstructions, turnaround),
      lastDecision: decision,
      guidance: describeStudentOrderNextStep({
        status: order.status,
        paymentReference: order.paymentReference,
        totalMinor: order.totalMinor,
        currency: order.currency,
        expiresAt: order.expiresAt,
        verificationTurnaroundHours: turnaround,
        lastDecision: decision,
      }),
    };
  }

  /**
   * #81 / #84: teacher-scoped order line items filtered by parent order status, so the
   * ledger module can separate pending (unverified) sales from confirmed sales without
   * importing OrderDao directly.
   */
  listTeacherOrderItems(
    scope: TeacherScope,
    statuses?: readonly OrderStatus[],
    tx?: TransactionClient,
  ): Promise<TeacherOrderItemRecord[]> {
    return this.orderDao.getTeacherOrderItemsBy(
      scope,
      statuses ? { order: { status: { in: [...statuses] } } } : {},
      tx,
    );
  }

  private orderUrl(orderId: string): string {
    return this.email.appUrl(`/orders/${orderId}`);
  }

  /** Sends a student email about an order; a failure is logged with the order for #9. */
  private async sendOrderEmail<T extends EmailTemplateName>(
    order: OrderRecord,
    template: T,
    data: EmailTemplateData<T>,
  ): Promise<void> {
    const sent = await this.email.send(order.student.email, template, data);
    if (!sent) {
      this.logger.warn(
        { orderId: order.id, paymentReference: order.paymentReference, template },
        'Order email not delivered',
      );
    }
  }
}

function toMatch(m: { transactionId: string; order: { id: string; paymentReference: string } }) {
  return {
    orderId: m.order.id,
    paymentReference: m.order.paymentReference,
    transactionId: m.transactionId,
  };
}

function receiptFor(order: OrderRecord): OrderReceipt {
  return buildOrderReceipt({
    id: order.id,
    paymentReference: order.paymentReference,
    status: order.status,
    verifiedAt: order.verifiedAt,
    totalMinor: order.totalMinor,
    currency: order.currency,
    student: { fullName: order.student.fullName, email: order.student.email },
    items: order.items.map((item) => ({
      courseId: item.courseId,
      courseTitle: item.course.title,
      teacherName: item.teacher.fullName,
      priceMinor: item.priceMinor,
    })),
  });
}

function courseList(order: OrderRecord): string {
  return order.items.map((item) => item.course.title).join(', ');
}
