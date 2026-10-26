import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { HealthDao } from './dao/health.dao';
import { HealthService } from './services/health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthDao],
})
export class HealthModule {}
