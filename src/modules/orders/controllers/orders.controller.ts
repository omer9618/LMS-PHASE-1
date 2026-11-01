import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CartPreviewInput, cartPreviewSchema } from '../schemas/order.schema';
import { CartPreviewView, OrderService } from '../services/order.service';

/** #54: Student cart preview supporting courses from multiple teachers. */
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
}
