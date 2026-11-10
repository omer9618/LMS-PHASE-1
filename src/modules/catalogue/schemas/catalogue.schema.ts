import { ProgressionMode } from '@prisma/client';
import { z } from 'zod';
import { paging, uuidParams } from '../../../common/schemas';

const minorUnits = z
  .string()
  .regex(/^\d{1,18}$/, 'Must be a whole number of minor units')
  .transform((v) => BigInt(v));

const booleanFlag = z.enum(['true', 'false']).transform((v) => v === 'true');

export const CATALOGUE_SORTS = ['newest', 'title', 'price_asc', 'price_desc'] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/**
 * #40–#44. Every filter is a query parameter, so the web app can mirror filter state in its URL
 * (#42) and any listing can be shared or bookmarked.
 */
export const catalogueQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(100).optional(),
  subjectId: z.uuid().optional(),
  boardId: z.uuid().optional(),
  levelId: z.uuid().optional(),
  pacing: z.enum(ProgressionMode).optional(),
  free: booleanFlag.optional(),
  minPriceMinor: minorUnits.optional(),
  maxPriceMinor: minorUnits.optional(),
  sort: z.enum(CATALOGUE_SORTS).default('newest'),
  ...paging({ max: 60, default: 24, maxOffset: 10_000 }),
});
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

export const catalogueCourseParamsSchema = uuidParams('courseId');
export type CatalogueCourseParams = z.infer<typeof catalogueCourseParamsSchema>;
