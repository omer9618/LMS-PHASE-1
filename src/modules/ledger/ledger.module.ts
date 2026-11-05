import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { LedgerDao } from './dao/ledger.dao';
import { LedgerService } from './services/ledger.service';

/** Teacher ledger (#78, #79, #80, #81; payouts and refunds extend it in M3). */
@Module({
  imports: [OrdersModule],
  providers: [LedgerService, LedgerDao],
  // Contract: earnings on payment confirmation (#80); balances, pending vs confirmed sales (#81), payouts later.
  exports: [LedgerService],
})
export class LedgerModule {}