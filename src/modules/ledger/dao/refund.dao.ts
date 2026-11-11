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

export type RefundRecord = Prisma.RefundGetPayload<{ select: typeof refundSelect }>;

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

  /** Refunds recorded inside the period, per currency of their order. */
  async getTotalsByCurrency(
    from: Date | null,
    to: Date | null,
  ): Promise<Array<{ currency: string; count: number; amountMinor: bigint }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ currency: string; count: number; amount: string }>
    >`
      SELECT o.currency::text AS currency, count(*)::int AS count, SUM(r.amount_minor)::text AS amount
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
       WHERE (${from}::timestamptz IS NULL OR r.created_at >= ${from}::timestamptz)
         AND (${to}::timestamptz IS NULL OR r.created_at <= ${to}::timestamptz)
       GROUP BY o.currency`;
    return rows.map((row) => ({
      currency: row.currency,
      count: row.count,
      amountMinor: BigInt(row.amount),
    }));
  }
}
