import { Injectable } from '@nestjs/common';
import {
  MismatchAction,
  OrderStatus,
  Prisma,
  RejectionReason,
  VerificationOutcome,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';
import type { QueueStats } from '../domain/verification.rules';

const verificationSelect = {
  id: true,
  orderId: true,
  proofId: true,
  outcome: true,
  amountReceivedMinor: true,
  valueDate: true,
  mismatchAction: true,
  rejectionReason: true,
  notes: true,
  verifiedById: true,
  verifiedAt: true,
} satisfies Prisma.PaymentVerificationSelect;

export type PaymentVerificationRecord = Prisma.PaymentVerificationGetPayload<{
  select: typeof verificationSelect;
}>;

export interface CreatePaymentVerificationData {
  orderId: string;
  proofId: string | null;
  outcome: VerificationOutcome;
  amountReceivedMinor: bigint | null;
  valueDate: Date | null;
  mismatchAction: MismatchAction | null;
  rejectionReason: RejectionReason | null;
  notes: string | null;
  verifiedById: string;
  verifiedAt: Date;
}

/** One order in the queue and since when it has been waiting for the admin. */
export interface QueueRow {
  orderId: string;
  waitingSince: Date | null;
}

/**
 * Orders waiting for a decision, each with the moment it started waiting: the first proof sent
 * after the last decision, or the latest proof when nothing came after it. Same rule as
 * waitingSince() in verification.rules.ts, which stays the readable statement of it.
 */
const WAITING = Prisma.sql`
  SELECT o.id AS order_id,
    COALESCE(
      (SELECT MIN(p.submitted_at)
         FROM payment_proofs p
        WHERE p.order_id = o.id
          AND p.submitted_at > COALESCE(
                (SELECT MAX(v.verified_at) FROM payment_verifications v WHERE v.order_id = o.id),
                '-infinity'::timestamptz)),
      (SELECT MAX(p.submitted_at) FROM payment_proofs p WHERE p.order_id = o.id)
    ) AS waiting_since
    FROM orders o
   WHERE o.status = ${OrderStatus.PROOF_SUBMITTED}::"OrderStatus"
`;

/** payment_verifications (#64-#66): one row per admin decision. Never updated or deleted. */
@Injectable()
export class VerificationDao {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of the queue, oldest first (ties by id), sorted and cut in the database. */
  async getQueuePage(limit: number, offset: number): Promise<QueueRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ order_id: string; waiting_since: Date | null }>
    >`
      WITH waiting AS (${WAITING})
      SELECT order_id, waiting_since
        FROM waiting
       ORDER BY waiting_since ASC NULLS FIRST, order_id ASC
       LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((row) => ({ orderId: row.order_id, waitingSince: row.waiting_since }));
  }

  countQueue(): Promise<number> {
    return this.prisma.order.count({ where: { status: OrderStatus.PROOF_SUBMITTED } });
  }

  /** Queue size, the oldest wait and how many are past `turnaroundMinutes`, all counted in SQL. */
  async getQueueStats(now: Date, turnaroundMinutes: number): Promise<QueueStats> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ size: number; oldest: Date | null; over: number }>
    >`
      WITH waiting AS (${WAITING})
      SELECT count(*)::int AS size,
             min(waiting_since) AS oldest,
             (count(*) FILTER (
               WHERE waiting_since IS NOT NULL
                 AND floor(extract(epoch FROM (${now}::timestamptz - waiting_since)) / 60)
                     > ${turnaroundMinutes}
             ))::int AS over
        FROM waiting`;
    return {
      size: row?.size ?? 0,
      oldestWaitingSince: row?.oldest ?? null,
      overTurnaround: row?.over ?? 0,
    };
  }

  createPaymentVerification(
    data: CreatePaymentVerificationData,
    tx?: TransactionClient,
  ): Promise<PaymentVerificationRecord> {
    return (tx ?? this.prisma).paymentVerification.create({ data, select: verificationSelect });
  }
}
