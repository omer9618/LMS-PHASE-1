import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { OrdersModule } from '../orders/orders.module';
import {
  AdminLedgerController,
  AdminRefundsController,
  TeacherEarningsController,
} from './controllers/ledger.controller';
import { LedgerDao } from './dao/ledger.dao';
import { RefundDao } from './dao/refund.dao';
import { LedgerService } from './services/ledger.service';

/** Teacher ledger (#78-#84; payouts extend it in M3). */
@Module({
  imports: [OrdersModule, EnrollmentModule, AuditModule, AuthModule],
  controllers: [TeacherEarningsController, AdminRefundsController, AdminLedgerController],
  providers: [LedgerService, LedgerDao, RefundDao],
  exports: [LedgerService],
})
export class LedgerModule {}