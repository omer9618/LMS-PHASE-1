import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  CartPreviewInput,
  cartPreviewSchema,
  CreateOrderInput,
  createOrderSchema,
} from '../schemas/order.schema';
import { CartPreviewView, OrderService, StudentOrderView } from '../services/order.service';

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
