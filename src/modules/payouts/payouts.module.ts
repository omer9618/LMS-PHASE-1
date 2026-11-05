import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import {
  AdminPayoutsController,
  TeacherPayoutsController,
} from './controllers/payout.controller';
import { PayoutDao } from './dao/payout.dao';
import { PayoutService } from './services/payout.service';

/** Payouts (#85-#89): payout recording, teacher notification, dispute window & auto-accept, concerns. */
@Module({
  imports: [LedgerModule, AuthModule, AuditModule, PlatformSettingsModule],
  controllers: [AdminPayoutsController, TeacherPayoutsController],
  providers: [PayoutService, PayoutDao],
  exports: [PayoutService],
})
export class PayoutsModule {}