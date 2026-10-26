import { Module } from '@nestjs/common';
import { ReferenceDataController } from './controllers/reference-data.controller';
import { ReferenceDataDao } from './dao/reference-data.dao';
import { ReferenceDataService } from './services/reference-data.service';

@Module({
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService, ReferenceDataDao],
  // Contract: other modules may use the service only, never the DAO.
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
