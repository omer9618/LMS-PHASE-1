import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
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
  teacher: { select: { id: true, fullName: true } },
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
}
