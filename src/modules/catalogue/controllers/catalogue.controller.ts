import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RateLimit } from '../../../common/rate-limit/rate-limits';
import {
  CatalogueCourseParams,
  catalogueCourseParamsSchema,
  CatalogueQuery,
  catalogueQuerySchema,
} from '../schemas/catalogue.schema';
import { CatalogueListing, CatalogueService, CourseDetail } from '../services/catalogue.service';

/** #40–#44: the public course catalogue. No sign-in needed. */
@Public()
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  /** Listing, search (#41) and filters (#42). Rate limited as a search endpoint (#17). */
  @RateLimit('SEARCH')
  @Get('courses')
  list(
    @Query(new ZodValidationPipe(catalogueQuerySchema)) query: CatalogueQuery,
  ): Promise<CatalogueListing> {
    return this.catalogueService.list(query);
  }

  @Get('courses/:courseId')
  detail(
    @Param(new ZodValidationPipe(catalogueCourseParamsSchema)) params: CatalogueCourseParams,
  ): Promise<CourseDetail> {
    return this.catalogueService.detail(params.courseId);
  }

  /** Subject is the primary browse axis (#40): subjects that have courses, with counts. */
  @Get('subjects')
  subjects(): Promise<Array<{ id: string; name: string; courseCount: number }>> {
    return this.catalogueService.subjects();
  }
}
