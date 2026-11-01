import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { scopeWhere, TeacherScope } from '../../../common/auth/scope';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const orderItemSelect = {
  id: true,
  orderId: true,
  courseId: true,
  teacherId: true,
  priceMinor: true,
  commissionRateBps: true,
  commissionMinor: true,
  netTeacherMinor: true,
  course: { select: { id: true, title: true } },
  teacher: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.OrderItemSelect;

const paymentProofSelect = {
  id: true,
  orderId: true,
  transactionId: true,
  proofFileUrl: true,
  amountClaimedMinor: true,
  submittedAt: true,
} satisfies Prisma.PaymentProofSelect;

const paymentProofWithOrderSelect = {
  ...paymentProofSelect,
  order: {
    select: {
      id: true,
      paymentReference: true,
    },
  },
} satisfies Prisma.PaymentProofSelect;

const orderSelect = {
  id: true,
  studentId: true,
  paymentReference: true,
  totalMinor: true,
  currency: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  verifiedAt: true,
  student: { select: { id: true, email: true, fullName: true } },
  items: {
    select: orderItemSelect,
    orderBy: { id: 'asc' as const },
  },
  proofs: {
    select: paymentProofSelect,
    orderBy: { submittedAt: 'asc' as const },
  },
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type OrderItemRecord = Prisma.OrderItemGetPayload<{ select: typeof orderItemSelect }>;
export type PaymentProofRecord = Prisma.PaymentProofGetPayload<{
  select: typeof paymentProofSelect;
}>;
export type PaymentProofWithOrderRecord = Prisma.PaymentProofGetPayload<{
  select: typeof paymentProofWithOrderSelect;
}>;

export interface CreateOrderData {
  studentId: string;
  paymentReference: string;
  totalMinor: bigint;
  currency: string;
  status?: OrderStatus;
  expiresAt: Date;
  items: Array<{
    courseId: string;
    teacherId: string;
    priceMinor: bigint;
    commissionRateBps: number;
    commissionMinor: bigint;
    netTeacherMinor: bigint;
  }>;
}

export interface CreatePaymentProofData {
  orderId: string;
  transactionId: string;
  proofFileUrl?: string | null;
  amountClaimedMinor?: bigint | null;
}

@Injectable()
export class OrderDao {
  constructor(private readonly prisma: PrismaService) {}

  createOrder(data: CreateOrderData, tx?: TransactionClient): Promise<OrderRecord> {
    const { items, ...orderFields } = data;
    return (tx ?? this.prisma).order.create({
      data: {
        ...orderFields,
        items: {
          create: items,
        },
      },
      select: orderSelect,
    });
  }

  getOrderBy(where: Prisma.OrderWhereInput, tx?: TransactionClient): Promise<OrderRecord | null> {
    return (tx ?? this.prisma).order.findFirst({
      where,
      select: orderSelect,
    });
  }

  /**
   * #57: conditionally transitions an order from `expectedStatus` to `nextStatus`, returning
   * true only if the row was still in `expectedStatus` at write time.
   */
  async updateOrderStatusIfCurrent(
    orderId: string,
    expectedStatus: OrderStatus,
    data: { status: OrderStatus; verifiedAt?: Date | null },
    tx?: TransactionClient,
  ): Promise<boolean> {
    const res = await (tx ?? this.prisma).order.updateMany({
      where: { id: orderId, status: expectedStatus },
      data,
    });
    return res.count === 1;
  }

  /** #58: persists a student's payment proof (required transactionId + optional proof file key). */
  createPaymentProof(
    data: CreatePaymentProofData,
    tx?: TransactionClient,
  ): Promise<PaymentProofRecord> {
    return (tx ?? this.prisma).paymentProof.create({
      data: {
        orderId: data.orderId,
        transactionId: data.transactionId,
        proofFileUrl: data.proofFileUrl ?? null,
        amountClaimedMinor: data.amountClaimedMinor ?? null,
      },
      select: paymentProofSelect,
    });
  }

  getPaymentProofsBy(
    where: Prisma.PaymentProofWhereInput,
    tx?: TransactionClient,
  ): Promise<PaymentProofRecord[]> {
    return (tx ?? this.prisma).paymentProof.findMany({
      where,
      select: paymentProofSelect,
      orderBy: { submittedAt: 'asc' },
    });
  }

  /** #59: finds proofs on other orders matching any of the given transaction IDs (case-insensitive). */
  getOtherOrderProofsByTransactionIds(
    excludeOrderId: string,
    transactionIds: readonly string[],
    tx?: TransactionClient,
  ): Promise<PaymentProofWithOrderRecord[]> {
    const unique = [...new Set(transactionIds.map((t) => t.trim()).filter(Boolean))];
    if (unique.length === 0) return Promise.resolve([]);
    return (tx ?? this.prisma).paymentProof.findMany({
      where: {
        orderId: { not: excludeOrderId },
        OR: unique.map((txId) => ({
          transactionId: { equals: txId, mode: 'insensitive' as const },
        })),
      },
      select: paymentProofWithOrderSelect,
      orderBy: { submittedAt: 'asc' },
    });
  }

  /**
   * #56: teacher-scoped read of order line items with their frozen price, commission rate,
   * commission amount, and net teacher earning snapshots.
   */
  getOrderItemsBy(
    scope: TeacherScope,
    where: Prisma.OrderItemWhereInput,
    tx?: TransactionClient,
  ): Promise<OrderItemRecord[]> {
    return (tx ?? this.prisma).orderItem.findMany({
      where: { AND: [where, scopeWhere(scope)] },
      select: orderItemSelect,
      orderBy: { id: 'asc' },
    });
  }
}
