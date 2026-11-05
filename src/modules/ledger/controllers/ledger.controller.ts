import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  AdminTeacherParams,
  adminTeacherParamsSchema,
  RecordAdjustmentInput,
  recordAdjustmentSchema,
  RecordRefundInput,
  recordRefundSchema,
  RefundOrderParams,
  refundOrderParamsSchema,
} from '../schemas/ledger.schema';
import { AdjustmentResult, LedgerService, RefundOrderResult } from '../services/ledger.service';

/** #82: Admin order refund recording, enrollment revocation, and compensating ledger entries. */
@Roles([Role.ADMIN])
@Controller('admin/orders')
export class AdminRefundsController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post(':orderId/refund')
  @HttpCode(HttpStatus.OK)
  recordRefund(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(refundOrderParamsSchema)) params: RefundOrderParams,
    @Body(new ZodValidationPipe(recordRefundSchema)) body: RecordRefundInput,
  ): Promise<RefundOrderResult> {
    return this.ledgerService.recordOrderRefund(admin, params.orderId, body);
  }
}

/** #83: Admin manual balance adjustments on a teacher's ledger. */
@Roles([Role.ADMIN])
@Controller('admin/teachers')
export class AdminLedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post(':teacherId/ledger/adjustments')
  recordAdjustment(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(adminTeacherParamsSchema)) params: AdminTeacherParams,
    @Body(new ZodValidationPipe(recordAdjustmentSchema)) body: RecordAdjustmentInput,
  ): Promise<AdjustmentResult> {
    return this.ledgerService.recordAdjustment(admin, params.teacherId, body);
  }
}