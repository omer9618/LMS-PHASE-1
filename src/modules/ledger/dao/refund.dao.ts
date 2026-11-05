import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

const refundSelect = {
  id: true,
  orderId: true,
  amountMinor: true,
  reason: true,
  transactionId: true,
  transferDate: true,
  authorisedById: true,
  createdAt: true,
  authorisedBy: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.RefundSelect;

const refundWithOrderSelect = {
  ...refundSelect,
  order: {
    select: {
      id: true,
      paymentReference: true,
      currency: true,
    },
  },
} satisfies Prisma.RefundSelect;

export type RefundRecord = Prisma.RefundGetPayload<{ select: typeof refundSelect }>;
export type RefundWithOrderRecord = Prisma.RefundGetPayload<{
  select: typeof refundWithOrderSelect;
}>;

export interface CreateRefundData {
  orderId: string;
  amountMinor: bigint;
  reason: string;
  transactionId: string;
  transferDate: Date;
  authorisedById: string;
}

/**
 * refunds (#82). Append-only: refund rows are created inside the refund transaction
 * and never updated or deleted.
 */
@Injectable()
export class RefundDao {
  constructor(private readonly prisma: PrismaService) {}

  createRefund(data: CreateRefundData, tx?: TransactionClient): Promise<RefundRecord> {
    return (tx ?? this.prisma).refund.create({
      data,
      select: refundSelect,
    });
  }

  getRefundsByOrderId(orderId: string, tx?: TransactionClient): Promise<RefundRecord[]> {
    return (tx ?? this.prisma).refund.findMany({
      where: { orderId },
      select: refundSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** #104: Admin financial summary — refunds filtered by createdAt range. */
  getRefundsBy(
    where: Prisma.RefundWhereInput,
    tx?: TransactionClient,
  ): Promise<RefundWithOrderRecord[]> {
    return (tx ?? this.prisma).refund.findMany({
      where,
      select: refundWithOrderSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}