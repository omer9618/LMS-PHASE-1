import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  PayoutIdParams,
  payoutIdParamsSchema,
  PayoutTeacherParams,
  payoutTeacherParamsSchema,
  RaisePayoutConcernInput,
  raisePayoutConcernSchema,
  RecordPayoutInput,
  recordPayoutSchema,
} from '../schemas/payout.schema';
import {
  PayoutDetailView,
  PayoutRecord,
  PayoutService,
  RaisePayoutConcernResult,
  RecordedPayoutResult,
} from '../services/payout.service';

/** #85: Admin records and inspects teacher payouts. */
@Roles([Role.ADMIN])
@Controller('admin')
export class AdminPayoutsController {
  constructor(private readonly payoutService: PayoutService) {}

  @Post('teachers/:teacherId/payouts')
  recordPayout(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(payoutTeacherParamsSchema)) params: PayoutTeacherParams,
    @Body(new ZodValidationPipe(recordPayoutSchema)) body: RecordPayoutInput,
  ): Promise<RecordedPayoutResult> {
    return this.payoutService.recordPayout(admin, params.teacherId, body);
  }

  @Get('teachers/:teacherId/payouts')
  listTeacherPayouts(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(payoutTeacherParamsSchema)) params: PayoutTeacherParams,
  ): Promise<PayoutRecord[]> {
    return this.payoutService.listTeacherPayoutsForAdmin(admin, params.teacherId);
  }

  @Get('payouts/:payoutId')
  getPayout(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(payoutIdParamsSchema)) params: PayoutIdParams,
  ): Promise<PayoutDetailView> {
    return this.payoutService.getPayoutForAdmin(admin, params.payoutId);
  }
}

/** #85: Teacher views their own payouts and itemised covered sales (#14 teacher-scoped). */
@Roles([Role.TEACHER])
@Controller('teacher/payouts')
export class TeacherPayoutsController {
  constructor(private readonly payoutService: PayoutService) {}

  @Get()
  listMyPayouts(@CurrentUser() teacher: AuthUser): Promise<PayoutRecord[]> {
    return this.payoutService.listMyPayouts(teacher);
  }

  @Get(':payoutId')
  getMyPayout(
    @CurrentUser() teacher: AuthUser,
    @Param(new ZodValidationPipe(payoutIdParamsSchema)) params: PayoutIdParams,
  ): Promise<PayoutDetailView> {
    return this.payoutService.getMyPayout(teacher, params.payoutId);
  }

  @Post(':payoutId/concerns')
  raiseConcern(
    @CurrentUser() teacher: AuthUser,
    @Param(new ZodValidationPipe(payoutIdParamsSchema)) params: PayoutIdParams,
    @Body(new ZodValidationPipe(raisePayoutConcernSchema)) body: RaisePayoutConcernInput,
  ): Promise<RaisePayoutConcernResult> {
    return this.payoutService.raiseMyPayoutConcern(teacher, params.payoutId, body);
  }
}