import { Module } from '@nestjs/common';
import { CatalogueController } from './controllers/catalogue.controller';
import { CatalogueDao } from './dao/catalogue.dao';
import { CatalogueService } from './services/catalogue.service';

/** Catalogue (#40–#45): public, read-only. */
@Module({
  controllers: [CatalogueController],
  providers: [CatalogueService, CatalogueDao],
  exports: [CatalogueService],
})
export class CatalogueModule {}
