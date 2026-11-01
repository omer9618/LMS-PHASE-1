import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CartPreviewInput,
  cartPreviewSchema,
  CreateOrderInput,
  createOrderSchema,
  OrderParams,
  orderParamsSchema,
} from '../schemas/order.schema';
import {
  CartPreviewView,
  OrderRecord,
  OrderService,
  StudentOrderView,
} from '../services/order.service';

/** #54, #55: Student cart preview and order creation. */
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
