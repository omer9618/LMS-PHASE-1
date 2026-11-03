import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { Paged } from '../../audit/services/audit.service';
import type { QueueMetrics } from '../domain/verification.rules';
import {
  ConfirmPaymentInput,
  confirmPaymentSchema,
  QueueQuery,
  queueQuerySchema,
  RejectPaymentInput,
  rejectPaymentSchema,
  VerificationOrderParams,
  verificationOrderParamsSchema,
} from '../schemas/verification.schema';
import {
  PaymentDecisionResult,
  VerificationQueueEntry,
  VerificationService,
} from '../services/verification.service';

/** #63-#67: admin payment verification. */
@Roles([Role.ADMIN])
@Controller('admin/verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get('queue')
  queue(
    @CurrentUser() admin: AuthUser,
    @Query(new ZodValidationPipe(queueQuerySchema)) query: QueueQuery,
  ): Promise<Paged<VerificationQueueEntry>> {
    return this.verificationService.queue(admin, query);
  }

  @Get('metrics')
  metrics(@CurrentUser() admin: AuthUser): Promise<QueueMetrics> {
    return this.verificationService.metrics(admin);
  }

  @Post('orders/:orderId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(verificationOrderParamsSchema)) params: VerificationOrderParams,
    @Body(new ZodValidationPipe(confirmPaymentSchema)) body: ConfirmPaymentInput,
  ): Promise<PaymentDecisionResult> {
    return this.verificationService.confirm(admin, params.orderId, body);
  }

  @Post('orders/:orderId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(verificationOrderParamsSchema)) params: VerificationOrderParams,
    @Body(new ZodValidationPipe(rejectPaymentSchema)) body: RejectPaymentInput,
  ): Promise<PaymentDecisionResult> {
    return this.verificationService.reject(admin, params.orderId, body);
  }
}
