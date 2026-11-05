import { Injectable } from '@nestjs/common';
import { MismatchAction, Prisma, RejectionReason, VerificationOutcome } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TransactionClient } from '../../../prisma/prisma.types';

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

/** payment_verifications (#64-#66): one row per admin decision. Never updated or deleted. */
@Injectable()
export class VerificationDao {
  constructor(private readonly prisma: PrismaService) {}

  createPaymentVerification(
    data: CreatePaymentVerificationData,
    tx?: TransactionClient,
  ): Promise<PaymentVerificationRecord> {
    return (tx ?? this.prisma).paymentVerification.create({ data, select: verificationSelect });
  }
}
