import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller';
import { AuditLogDao } from './dao/audit-log.dao';
import { AuditService } from './services/audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogDao],
  // Contract: every module records audit entries through AuditService.
  exports: [AuditService],
})
export class AuditModule {}
