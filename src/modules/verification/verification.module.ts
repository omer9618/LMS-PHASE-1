import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { VerificationController } from './controllers/verification.controller';
import { VerificationDao } from './dao/verification.dao';
import { VerificationService } from './services/verification.service';

/** Payment verification (#63-#67): queue, metrics, confirm, reject, amount mismatches. */
@Module({
  imports: [OrdersModule, EnrollmentModule, LedgerModule, PlatformSettingsModule],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationDao],
})
export class VerificationModule {}
