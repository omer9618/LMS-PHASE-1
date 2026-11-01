import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OrderStatus, UserStatus } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { TransactionClient } from '../../../prisma/prisma.types';
import { TransactionService } from '../../../prisma/transaction.service';
import { CourseService } from '../../courses/services/course.service';
import { EmailService } from '../../email/services/email.service';
import { EnrollmentAccessService } from '../../enrollment/services/enrollment-access.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { OrderDao, OrderItemRecord, OrderRecord } from '../dao/order.dao';
import {
  assertEmailVerifiedForOrder,
  buildCartQuote,
  buildPaymentInstructions,
  CartQuote,
  computeOrderExpiry,
  formatPaymentReference,
  PaymentInstructions,
  PurchasableCourseFacts,
} from '../domain/order.rules';
import type { CartPreviewInput, CreateOrderInput } from '../schemas/order.schema';

export type { OrderItemRecord, OrderRecord };

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
  paymentInstructions: PaymentInstructions;
}

/**
 * Orders and cart (#54, #55, #56). Validates multi-teacher carts, creates orders with unique
 * payment references, and persists frozen price and commission snapshots on every line item.
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
   * #55, #56: creates an order with a unique payment reference, stores frozen price, commission
   * rate, commission amount and net teacher earning snapshots on each line item, and emails
   * transfer instructions.
   */
  async createOrder(user: AuthUser, input: CreateOrderInput): Promise<StudentOrderView> {
    assertEmailVerifiedForOrder(user.isEmailVerified);
    const expiryHours = await this.platformSettings.get('ORDER_EXPIRY_WINDOW_HOURS');
    const now = new Date();
    const expiresAt = computeOrderExpiry(now, expiryHours);

    const order = await this.transactions.run(async (tx) => {
      const quote = await this.quoteCart(user, input.courseIds, tx);
      const paymentReference = await this.generateUniquePaymentReference(now, tx);
      return this.orderDao.createOrder(
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

  /** #56: admin view of an order including frozen line-item snapshots (commission bps, net, etc.). */
  async getOrderForAdmin(admin: AuthUser, orderId: string): Promise<OrderRecord> {
    adminScope(admin);
    const order = await this.orderDao.getOrderBy({ id: orderId });
    if (!order) throw new AppException(ErrorCode.NOT_FOUND, { entity: 'order', id: orderId });
    return order;
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
      paymentInstructions: buildPaymentInstructions({
        paymentReference: order.paymentReference,
        totalMinor: order.totalMinor,
        currency: order.currency,
        expiresAt: order.expiresAt,
      }),
    };
  }
}
