import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { AuditService } from '../../audit/services/audit.service';
import { CourseService } from '../../courses/services/course.service';
import { EmailService } from '../../email/services/email.service';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { IncomingFile, StorageService } from '../../storage/services/storage.service';
import { OrderDao, OrderItemRecord, OrderRecord, PaymentProofRecord } from '../dao/order.dao';
import {
  assertEmailVerifiedForOrder,
  buildCartQuote,
  buildDuplicateTransactionIdWarning,
  buildPaymentInstructions,
  CartQuote,
  computeOrderExpiry,
  DuplicateTransactionIdWarning,
  formatPaymentReference,
  OrderAction,
  OrderTransitionResult,
  PaymentInstructions,
  PurchasableCourseFacts,
  transitionOrder,
} from '../domain/order.rules';
import type {
  CartPreviewInput,
  CreateOrderInput,
  SubmitPaymentProofInput,
} from '../schemas/order.schema';

export type { OrderItemRecord, OrderRecord, PaymentProofRecord };

export interface CartPreviewItemView {
  courseId: string;
  title: string;
  teacherId: string;
  teacherName: string | null;
  priceMinor: bigint;
  currency: string;
}

export interface CartPreviewView {
  items: CartPreviewItemView[];
  currency: string;
  totalMinor: bigint;
  teacherCount: number;
}

export interface StudentOrderItemView {
  id: string;
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string | null;
  priceMinor: bigint;
  currency: string;
}

export interface StudentPaymentProofView {
  id: string;
  transactionId: string;
  amountClaimedMinor: bigint | null;
  hasProofFile: boolean;
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
  items: StudentOrderItemView[];
  proofs: StudentPaymentProofView[];
  paymentInstructions: PaymentInstructions;
}

export interface SubmittedPaymentProofView {
  orderId: string;
  orderStatus: OrderStatus;
  proof: StudentPaymentProofView;
  proofs: StudentPaymentProofView[];
  duplicateTransactionIdWarning: DuplicateTransactionIdWarning | null;
}

export interface AdminOrderDetailView extends OrderRecord {
  duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[];
}

/**
 * Orders and cart (#54, #55, #56, #57, #58, #59). Validates multi-teacher carts, creates orders
 * with unique payment references, persists frozen price and commission snapshots on every line
 * item, enforces the order lifecycle state machine with audit attribution, records payment proofs,
 * and warns on duplicate transaction IDs across orders without blocking submission.
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
  ) {}

  /**
   * #54: validates a multi-teacher cart and returns the student-facing summary.
   * Internal commission splits are computed by the domain rules (for #56) and never exposed here.
   */
  async previewCart(user: AuthUser, input: CartPreviewInput): Promise<CartPreviewView> {
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
   * #55, #56, #57: creates an order with a unique payment reference, stores frozen price,
   * commission rate, commission amount and net teacher earning snapshots on each line item,
   * records the initial ORDER_CREATED audit entry, and emails transfer instructions.
   */
  async createOrder(user: AuthUser, input: CreateOrderInput): Promise<StudentOrderView> {
    assertEmailVerifiedForOrder(user.isEmailVerified);
    const expiryHours = await this.platformSettings.get('ORDER_EXPIRY_WINDOW_HOURS');
    const now = new Date();
    const expiresAt = computeOrderExpiry(now, expiryHours);

    const order = await this.transactions.run(async (tx) => {
      const quote = await this.quoteCart(user, input.courseIds, tx);
      const paymentReference = await this.generateUniquePaymentReference(now, tx);
      const created = await this.orderDao.createOrder(
        {
          studentId: user.id,
          paymentReference,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
          status: OrderStatus.PENDING,
          expiresAt,
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
            transitionedAt: now.toISOString(),
            paymentReference: created.paymentReference,
            totalMinor: created.totalMinor.toString(),
            currency: created.currency,
            courseIds: created.items.map((item) => item.courseId),
          },
        },
        tx,
      );
      return created;
    });

    const view = this.toStudentOrderView(order);
    await this.email.send(user.email, 'ORDER_CREATED', {
      paymentReference: view.paymentReference,
      totalMinor: view.totalMinor.toString(),
      currency: view.currency,
      bankName: view.paymentInstructions.bank.bankName,
      accountTitle: view.paymentInstructions.bank.accountTitle,
      accountNumber: view.paymentInstructions.bank.accountNumber,
      iban: view.paymentInstructions.bank.iban,
      expiresAt: expiresAt.toISOString(),
      orderUrl: this.email.appUrl(`/orders/${view.id}`),
    });

    return view;
  }

  /**
   * #58, #59: submits a proof of payment for an order owned by the student. Requires a bank
   * transaction ID, accepts an optional screenshot/PDF (`PAYMENT_PROOF`), supports multiple proofs
   * per order, transitions the order to `PROOF_SUBMITTED`, and returns a non-blocking warning when
   * the transaction ID already exists on another order.
   */
  async submitPaymentProof(
    user: AuthUser,
    orderId: string,
    input: SubmitPaymentProofInput,
    file?: IncomingFile,
  ): Promise<SubmittedPaymentProofView> {
    const existing = await this.orderDao.getOrderBy({ id: orderId, studentId: user.id });
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
    }

    const now = new Date();
    // Validate the state transition upfront before storing any uploaded file.
    transitionOrder(existing.status, 'SUBMIT_PROOF', now);

    const stored = file ? await this.storage.store('PAYMENT_PROOF', 'payment-proof', file) : null;

    try {
      return await this.transactions.run(async (tx) => {
        const order = await this.orderDao.getOrderBy({ id: orderId, studentId: user.id }, tx);
        if (!order) {
          throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
        }

        const otherMatches = await this.orderDao.getOtherOrderProofsByTransactionIds(
          order.id,
          [input.transactionId],
          tx,
        );
        const duplicateWarning = buildDuplicateTransactionIdWarning(
          order.id,
          input.transactionId,
          otherMatches.map((m) => ({
            orderId: m.order.id,
            paymentReference: m.order.paymentReference,
            transactionId: m.transactionId,
          })),
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

        const transition = await this.applyOrderTransition(
          order,
          'SUBMIT_PROOF',
          user.id,
          {
            proofId: proof.id,
            transactionId: proof.transactionId,
            hasProofFile: proof.proofFileUrl !== null,
            duplicateTransactionId: duplicateWarning !== null,
            ...(duplicateWarning
              ? { conflictingOrderIds: duplicateWarning.conflictingOrderIds }
              : {}),
            ...(proof.amountClaimedMinor !== null
              ? { amountClaimedMinor: proof.amountClaimedMinor.toString() }
              : {}),
          },
          now,
          tx,
        );

        const allProofs = await this.orderDao.getPaymentProofsBy({ orderId: order.id }, tx);
        return {
          orderId: order.id,
          orderStatus: transition.to as OrderStatus,
          proof: this.toStudentProofView(proof),
          proofs: allProofs.map((p) => this.toStudentProofView(p)),
          duplicateTransactionIdWarning: duplicateWarning,
        };
      });
    } catch (error) {
      if (stored) {
        await this.storage.delete(stored.key).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * #57: validates and applies a state transition on an order inside a caller-owned transaction,
   * recording the actor, timestamp, and from/to state in `audit_log`.
   */
  async applyOrderTransition(
    order: { id: string; status: OrderStatus },
    action: OrderAction,
    actorUserId: string | null,
    details: Prisma.InputJsonObject,
    now: Date,
    tx: TransactionClient,
  ): Promise<OrderTransitionResult> {
    const transition = transitionOrder(order.status, action, now);
    const updated = await this.orderDao.updateOrderStatusIfCurrent(
      order.id,
      order.status,
      {
        status: transition.to as OrderStatus,
        ...(transition.verifiedAt ? { verifiedAt: transition.verifiedAt } : {}),
      },
      tx,
    );
    if (!updated) {
      throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
        orderId: order.id,
        action,
      });
    }
    await this.audit.record(
      {
        actorUserId,
        action: transition.auditAction,
        entityType: 'order',
        entityId: order.id,
        details: {
          from: transition.from,
          to: transition.to,
          transitionedAt: transition.transitionedAt.toISOString(),
          ...details,
        },
      },
      tx,
    );
    return transition;
  }

  /**
   * #56, #59: admin view of an order including frozen line-item snapshots and any duplicate
   * transaction ID warnings across other orders.
   */
  async getOrderForAdmin(admin: AuthUser, orderId: string): Promise<AdminOrderDetailView> {
    adminScope(admin);
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });

    const otherMatches = await this.orderDao.getOtherOrderProofsByTransactionIds(
      order.id,
      order.proofs.map((p) => p.transactionId),
    );
    const matchInputs = otherMatches.map((m) => ({
      orderId: m.order.id,
      paymentReference: m.order.paymentReference,
      transactionId: m.transactionId,
    }));
    const seenTxIds = new Set<string>();
    const duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[] = [];
    for (const proof of order.proofs) {
      const key = proof.transactionId.trim().toLowerCase();
      if (seenTxIds.has(key)) continue;
      seenTxIds.add(key);
      const warning = buildDuplicateTransactionIdWarning(
        order.id,
        proof.transactionId,
        matchInputs,
      );
      if (warning) duplicateTransactionIdWarnings.push(warning);
    }

    return {
      ...order,
      duplicateTransactionIdWarnings,
    };
  }

  /** Computes the full cart quote (including frozen commission splits for order creation). */
  async quoteCart(
    user: AuthUser,
    requestedCourseIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<CartQuote> {
    const uniqueIds = [...new Set(requestedCourseIds)];
    const rawCourses = await this.courseService.getSaleFacts(uniqueIds, tx);
    const foundIds = new Set(rawCourses.map((c) => c.id));
    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        throw new AppException(ErrorCode.NOT_FOUND, { entity: 'course', id });
      }
    }

    const activeEnrolledIds = new Set<string>();
    await Promise.all(
      uniqueIds.map(async (courseId) => {
        if (await this.enrollmentAccess.hasActiveEnrollment(user.id, courseId)) {
          activeEnrolledIds.add(courseId);
        }
      }),
    );

    const facts: PurchasableCourseFacts[] = rawCourses.map((c) => ({
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

    return buildCartQuote(uniqueIds, facts, user.id, activeEnrolledIds);
  }

  private async generateUniquePaymentReference(now: Date, tx: TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = formatPaymentReference(now, randomBytes(6));
      const existing = await this.orderDao.getOrderBy({ paymentReference: candidate }, tx);
      if (!existing) return candidate;
    }
    throw new AppException(ErrorCode.INTERNAL);
  }

  private toStudentProofView(proof: PaymentProofRecord): StudentPaymentProofView {
    return {
      id: proof.id,
      transactionId: proof.transactionId,
      amountClaimedMinor: proof.amountClaimedMinor,
      hasProofFile: proof.proofFileUrl !== null,
      submittedAt: proof.submittedAt,
    };
  }

  private toStudentOrderView(order: OrderRecord): StudentOrderView {
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
        id: item.id,
        courseId: item.courseId,
        courseTitle: item.course.title,
        teacherId: item.teacherId,
        teacherName: item.teacher.fullName,
        priceMinor: item.priceMinor,
        currency: order.currency,
      })),
      proofs: order.proofs.map((proof) => this.toStudentProofView(proof)),
      paymentInstructions: buildPaymentInstructions({
        paymentReference: order.paymentReference,
        totalMinor: order.totalMinor,
        currency: order.currency,
        expiresAt: order.expiresAt,
      }),
    };
  }
}
