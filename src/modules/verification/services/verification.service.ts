import { Injectable } from '@nestjs/common';
import { OrderStatus, VerificationOutcome } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth/auth-user';
import { adminScope } from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { DomainError } from '../../../common/errors/domain.error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { Paged } from '../../audit/services/audit.service';
import { EnrollmentService } from '../../enrollment/services/enrollment.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  DuplicateTransactionIdWarning,
  OrderRecord,
  OrderService,
  PaymentProofView,
} from '../../orders/services/order.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { VerificationDao } from '../dao/verification.dao';
import {
  assertRejectionReason,
  checkClaimedAmount,
  ClaimedAmountCheck,
  currentRoundProofs,
  decidePaymentConfirmation,
  minutesBetween,
  QueueMetrics,
  queueMetrics,
} from '../domain/verification.rules';
import type {
  ConfirmPaymentInput,
  QueueQuery,
  RejectPaymentInput,
} from '../schemas/verification.schema';

export interface VerificationQueueEntry {
  orderId: string;
  paymentReference: string;
  student: { id: string; email: string; fullName: string | null };
  totalMinor: bigint;
  currency: string;
  items: Array<{ courseTitle: string; teacherName: string | null; priceMinor: bigint }>;
  /** Proofs submitted since the last full rejection: what the admin is deciding on. */
  proofs: PaymentProofView[];
  waitingSince: Date | null;
  waitingMinutes: number | null;
  overTurnaround: boolean;
  /** What the student says they paid against the total (#63, #66). */
  claimed: ClaimedAmountCheck;
  duplicateTransactionIdWarnings: DuplicateTransactionIdWarning[];
  /** Received so far, if an earlier decision asked for a top-up. */
  previouslyReceivedMinor: bigint | null;
}

export interface PaymentDecisionResult {
  orderId: string;
  paymentReference: string;
  status: OrderStatus;
  verificationId: string;
  outcome: VerificationOutcome;
  totalMinor: bigint;
  amountReceivedMinor: bigint | null;
  /** received - total (#66). */
  differenceMinor: bigint | null;
  mismatchAction: string | null;
  rejectionReason: string | null;
  enrollmentsGranted: number;
  ledgerEntriesWritten: number;
}

/**
 * Payment verification (#63-#67): the admin queue and metrics, confirmation (with paid enrollment
 * #48 and teacher earnings #80 in the same transaction), rejection, and amount mismatches.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly verificationDao: VerificationDao,
    private readonly orderService: OrderService,
    private readonly enrollmentService: EnrollmentService,
    private readonly ledgerService: LedgerService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly transactions: TransactionService,
    @InjectPinoLogger(VerificationService.name) private readonly logger: PinoLogger,
  ) {}

  /** #63: orders awaiting verification, oldest first, with warnings and mismatches. */
  async queue(admin: AuthUser, query: QueueQuery): Promise<Paged<VerificationQueueEntry>> {
    adminScope(admin);
    const now = new Date();
    // Sorting and paging happen in the database: the queue can hold thousands of orders, and
    // only one page of them is ever loaded.
    const [rows, total, turnaround] = await Promise.all([
      this.verificationDao.getQueuePage(query.limit, query.offset),
      this.verificationDao.countQueue(),
      this.platformSettings.get('VERIFICATION_TURNAROUND_HOURS'),
    ]);
    const orders = new Map(
      (await this.orderService.listByIds(rows.map((row) => row.orderId))).map((o) => [o.id, o]),
    );
    // An order decided since the page was cut is simply no longer in the queue.
    const page = rows.flatMap((row) => {
      const order = orders.get(row.orderId);
      return order ? [{ order, waitingSince: row.waitingSince }] : [];
    });
    const warnings = await this.orderService.duplicateWarnings(page.map((e) => e.order));
    const items = await Promise.all(
      page.map((entry) =>
        this.toQueueEntry(entry.order, entry.waitingSince, warnings, turnaround, now),
      ),
    );
    return { items, total, limit: query.limit, offset: query.offset };
  }

  /** #67: queue size and the oldest waiting order against the published turnaround. */
  async metrics(admin: AuthUser): Promise<QueueMetrics> {
    adminScope(admin);
    const now = new Date();
    const turnaround = await this.platformSettings.get('VERIFICATION_TURNAROUND_HOURS');
    const stats = await this.verificationDao.getQueueStats(now, turnaround * 60);
    return queueMetrics(stats, turnaround, now);
  }

  /**
   * #64, #66, #48, #80: records the amount received and value date. When the order is confirmed
   * (exact amount, or CONFIRM_ANYWAY), one transaction writes the verification, sets the order
   * VERIFIED, grants the enrollments and writes the teachers' earnings. A course that closed
   * since the order is still granted: the student has paid. Emails go out after the commit.
   */
  async confirm(
    admin: AuthUser,
    orderId: string,
    input: ConfirmPaymentInput,
  ): Promise<PaymentDecisionResult> {
    adminScope(admin);
    const now = new Date();
    let result: PaymentDecisionResult;
    try {
      result = await this.transactions.run(async (tx) => {
        const order = await this.orderService.getOrderInTransaction(orderId, tx);
        assertAwaitingVerification(order);
        const decision = decidePaymentConfirmation({
          totalMinor: order.totalMinor,
          amountReceivedMinor: input.amountReceivedMinor,
          valueDate: input.valueDate,
          mismatchAction: input.mismatchAction,
          rejectionReason: input.rejectionReason,
          now,
        });
        const confirmed = decision.action === 'CONFIRM';
        const verification = await this.verificationDao.createPaymentVerification(
          {
            orderId,
            proofId: order.proofs.at(-1)?.id ?? null,
            outcome: confirmed ? VerificationOutcome.CONFIRMED : VerificationOutcome.REJECTED,
            amountReceivedMinor: input.amountReceivedMinor,
            valueDate: new Date(`${input.valueDate}T00:00:00.000Z`),
            mismatchAction: decision.mismatchAction,
            rejectionReason: decision.rejectionReason,
            notes: input.notes || null,
            verifiedById: admin.id,
            verifiedAt: now,
          },
          tx,
        );

        let enrollmentsGranted = 0;
        let ledgerEntriesWritten = 0;
        if (confirmed) {
          enrollmentsGranted = await this.enrollmentService.grantPurchased(
            order.studentId,
            order.items.map((item) => ({ courseId: item.courseId, orderItemId: item.id })),
            tx,
          );
          const entries = await this.ledgerService.recordEarnings(
            {
              paymentReference: order.paymentReference,
              currency: order.currency,
              createdById: admin.id,
              lines: order.items.map((item) => ({
                orderItemId: item.id,
                teacherId: item.teacherId,
                courseTitle: item.course.title,
                netTeacherMinor: item.netTeacherMinor,
              })),
            },
            tx,
          );
          ledgerEntriesWritten = entries.length;
        }

        const change = await this.orderService.transition(
          order,
          decision.action,
          admin.id,
          {
            verificationId: verification.id,
            amountReceivedMinor: input.amountReceivedMinor.toString(),
            totalMinor: order.totalMinor.toString(),
            differenceMinor: decision.differenceMinor.toString(),
            valueDate: input.valueDate,
            mismatchAction: decision.mismatchAction,
            rejectionReason: decision.rejectionReason,
            notes: input.notes || null,
            enrollmentsGranted,
            ledgerEntriesWritten,
          },
          now,
          tx,
        );
        return {
          orderId,
          paymentReference: order.paymentReference,
          status: change.to as OrderStatus,
          verificationId: verification.id,
          outcome: verification.outcome,
          totalMinor: order.totalMinor,
          amountReceivedMinor: input.amountReceivedMinor,
          differenceMinor: decision.differenceMinor,
          mismatchAction: decision.mismatchAction,
          rejectionReason: decision.rejectionReason,
          enrollmentsGranted,
          ledgerEntriesWritten,
        };
      });
    } catch (err) {
      // #9: a failed confirmation must be diagnosable from the logs alone.
      this.logPaymentFailure(err, orderId, admin.id, 'confirm');
      throw err;
    }

    this.logger.info({ ...logFields(result), adminId: admin.id }, 'Payment decision recorded');
    if (result.status === OrderStatus.VERIFIED) {
      await this.orderService.notifyOrderVerified(orderId);
    } else if (result.status === OrderStatus.PENDING) {
      await this.orderService.notifyTopUpRequested(orderId, -result.differenceMinor!);
    } else {
      await this.orderService.notifyOrderRejected(
        orderId,
        result.rejectionReason ?? 'OTHER',
        input.notes || null,
      );
    }
    return result;
  }

  /** #65: rejects the payment with a reason; the student is emailed it and may resubmit. */
  async reject(
    admin: AuthUser,
    orderId: string,
    input: RejectPaymentInput,
  ): Promise<PaymentDecisionResult> {
    adminScope(admin);
    const notes = input.notes || null;
    assertRejectionReason(input.rejectionReason, notes);
    const now = new Date();
    let result: PaymentDecisionResult;
    try {
      result = await this.transactions.run(async (tx) => {
        const order = await this.orderService.getOrderInTransaction(orderId, tx);
        assertAwaitingVerification(order);
        const verification = await this.verificationDao.createPaymentVerification(
          {
            orderId,
            proofId: order.proofs.at(-1)?.id ?? null,
            outcome: VerificationOutcome.REJECTED,
            amountReceivedMinor: null,
            valueDate: null,
            mismatchAction: null,
            rejectionReason: input.rejectionReason,
            notes,
            verifiedById: admin.id,
            verifiedAt: now,
          },
          tx,
        );
        const change = await this.orderService.transition(
          order,
          'REJECT',
          admin.id,
          { verificationId: verification.id, rejectionReason: input.rejectionReason, notes },
          now,
          tx,
        );
        return {
          orderId,
          paymentReference: order.paymentReference,
          status: change.to as OrderStatus,
          verificationId: verification.id,
          outcome: verification.outcome,
          totalMinor: order.totalMinor,
          amountReceivedMinor: null,
          differenceMinor: null,
          mismatchAction: null,
          rejectionReason: input.rejectionReason,
          enrollmentsGranted: 0,
          ledgerEntriesWritten: 0,
        };
      });
    } catch (err) {
      this.logPaymentFailure(err, orderId, admin.id, 'reject');
      throw err;
    }
    this.logger.info({ ...logFields(result), adminId: admin.id }, 'Payment decision recorded');
    await this.orderService.notifyOrderRejected(orderId, input.rejectionReason, notes);
    return result;
  }

  private async toQueueEntry(
    order: OrderRecord,
    since: Date | null,
    warnings: Map<string, DuplicateTransactionIdWarning[]>,
    turnaroundHours: number,
    now: Date,
  ): Promise<VerificationQueueEntry> {
    const round = currentRoundProofs(order.proofs, order.verifications);
    const waitingMinutes = since ? minutesBetween(since, now) : null;
    const last = order.verifications.at(-1);
    return {
      orderId: order.id,
      paymentReference: order.paymentReference,
      student: order.student,
      totalMinor: order.totalMinor,
      currency: order.currency,
      items: order.items.map((item) => ({
        courseTitle: item.course.title,
        teacherName: item.teacher.fullName,
        priceMinor: item.priceMinor,
      })),
      proofs: await Promise.all(round.map((p) => this.orderService.toProofView(p))),
      waitingSince: since,
      waitingMinutes,
      overTurnaround: waitingMinutes !== null && waitingMinutes > turnaroundHours * 60,
      claimed: checkClaimedAmount(order.totalMinor, round),
      duplicateTransactionIdWarnings: warnings.get(order.id) ?? [],
      previouslyReceivedMinor:
        last?.mismatchAction === 'REQUEST_TOP_UP' ? last.amountReceivedMinor : null,
    };
  }

  /** Refusals (4xx, domain rules) are warnings; anything else is an error with its stack. */
  private logPaymentFailure(err: unknown, orderId: string, adminId: string, action: string): void {
    const refused = err instanceof DomainError || (err instanceof AppException && err.status < 500);
    const fields = { err, orderId, adminId, action };
    if (refused) this.logger.warn(fields, 'Payment decision refused');
    else this.logger.error(fields, 'Payment decision failed; nothing was committed');
  }
}

/** Only an order with a proof under review can be decided (checked before any write). */
function assertAwaitingVerification(order: OrderRecord): void {
  if (order.status !== OrderStatus.PROOF_SUBMITTED) {
    throw new AppException(ErrorCode.INVALID_STATE_TRANSITION, {
      orderId: order.id,
      status: order.status,
      reason: 'The order is not awaiting verification',
    });
  }
}

function logFields(result: PaymentDecisionResult) {
  return {
    orderId: result.orderId,
    paymentReference: result.paymentReference,
    status: result.status,
    verificationId: result.verificationId,
    amountReceivedMinor: result.amountReceivedMinor?.toString() ?? null,
    differenceMinor: result.differenceMinor?.toString() ?? null,
    enrollmentsGranted: result.enrollmentsGranted,
    ledgerEntriesWritten: result.ledgerEntriesWritten,
  };
}
