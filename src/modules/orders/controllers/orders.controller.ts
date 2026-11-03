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
  CreateOrderInput,
  createOrderSchema,
  OrderParams,
  orderParamsSchema,
  QuoteCartInput,
  quoteCartSchema,
  SubmitPaymentProofInput,
  submitPaymentProofSchema,
} from '../schemas/order.schema';
import {
  AdminOrderView,
  CartQuoteView,
  OrderReceipt,
  OrderService,
  StudentOrderView,
  SubmittedProofView,
} from '../services/order.service';

/** #54: cart quote. The cart itself lives on the client. Any signed-in user may buy. */
@Controller('cart')
export class CartController {
  constructor(private readonly orderService: OrderService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(quoteCartSchema)) body: QuoteCartInput,
  ): Promise<CartQuoteView> {
    return this.orderService.quote(user, body);
  }
}

/** #55: place an order. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ): Promise<StudentOrderView> {
    return this.orderService.createOrder(user, body);
  }
}

/** #58, #60, #62: the student's own orders. Another student's order is 404. */
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<StudentOrderView[]> {
    return this.orderService.listMyOrders(user);
  }

  @Get(':orderId')
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(orderParamsSchema)) params: OrderParams,
  ): Promise<StudentOrderView> {
    return this.orderService.getMyOrder(user, params.orderId);
  }

  @Get(':orderId/receipt')
  receipt(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(orderParamsSchema)) params: OrderParams,
  ): Promise<OrderReceipt> {
    return this.orderService.getMyReceipt(user, params.orderId);
  }

  /** Multipart: `transactionId`, optional `amountClaimedMinor`, optional `file`. */
  @Post(':orderId/proofs')
  @UseInterceptors(
    FileInterceptor('file', {
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
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<SubmittedProofView> {
    return this.orderService.submitProof(user, params.orderId, body, file);
  }
}

/** Admin order detail: frozen line snapshots (#56), proofs, decisions, duplicate warnings (#59). */
@Roles([Role.ADMIN])
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orderService: OrderService) {}

  @Get(':orderId')
  get(
    @CurrentUser() admin: AuthUser,
    @Param(new ZodValidationPipe(orderParamsSchema)) params: OrderParams,
  ): Promise<AdminOrderView> {
    return this.orderService.getOrderForAdmin(admin, params.orderId);
  }
}
