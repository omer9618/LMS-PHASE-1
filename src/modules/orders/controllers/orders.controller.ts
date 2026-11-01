import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { UPLOAD_POLICIES } from '../../storage/domain/upload-policy';
import {
  CartPreviewInput,
  cartPreviewSchema,
  CreateOrderInput,
  createOrderSchema,
  OrderParams,
  orderParamsSchema,
  SubmitPaymentProofInput,
  submitPaymentProofSchema,
} from '../schemas/order.schema';
import {
  CartPreviewView,
  OrderRecord,
  OrderService,
  StudentOrderView,
  SubmittedPaymentProofView,
} from '../services/order.service';

/** #54, #55, #58: Student cart preview, order creation, and payment proof submission. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Post('cart/preview')
  @HttpCode(HttpStatus.OK)
  previewCart(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(cartPreviewSchema)) body: CartPreviewInput,
  ): Promise<CartPreviewView> {
    return this.orderService.previewCart(user, body);
  }

  @Post()
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ): Promise<StudentOrderView> {
    return this.orderService.createOrder(user, body);
  }

  /** #58: submit a proof of payment (required transactionId + optional screenshot/PDF). */
  @Post(':orderId/proofs')
  @UseInterceptors(
    FileInterceptor('proof', {
      limits: {
        fileSize: UPLOAD_POLICIES.PAYMENT_PROOF.maxBytes,
        files: 1,
        fields: 5,
        fieldSize: 4 * 1024,
      },
    }),
  )
  submitProof(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(orderParamsSchema)) params: OrderParams,
    @Body(new ZodValidationPipe(submitPaymentProofSchema)) body: SubmitPaymentProofInput,
    @UploadedFile() proof: Express.Multer.File | undefined,
  ): Promise<SubmittedPaymentProofView> {
    return this.orderService.submitPaymentProof(user, params.orderId, body, proof);
  }
}

/** #56: Admin order detail showing frozen line-item snapshots. */
@Roles([Role.ADMIN])
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Get(':orderId')
  getOrder(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(orderParamsSchema)) params: OrderParams,
  ): Promise<OrderRecord> {
    return this.orderService.getOrderForAdmin(admin, params.orderId);
  }
}
