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
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type OrderItemRecord = Prisma.OrderItemGetPayload<{ select: typeof orderItemSelect }>;

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
