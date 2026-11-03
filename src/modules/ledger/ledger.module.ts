import { Module } from '@nestjs/common';
import { LedgerDao } from './dao/ledger.dao';
import { LedgerService } from './services/ledger.service';

/** Teacher ledger (#80; payouts and refunds extend it in M3). */
@Module({
  providers: [LedgerService, LedgerDao],
  // Contract: earnings on payment confirmation (#80); balances and payouts later.
  exports: [LedgerService],
})
export class LedgerModule {}
