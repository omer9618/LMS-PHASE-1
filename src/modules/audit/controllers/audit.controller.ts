import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AuditLogQuery, auditLogQuerySchema } from '../schemas/audit.schema';
import { AuditEntryRecord, AuditService, Paged } from '../services/audit.service';

/** #108: audit log viewer. */
@Roles([Role.ADMIN])
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<Paged<AuditEntryRecord>> {
    return this.auditService.search(query);
  }
}
