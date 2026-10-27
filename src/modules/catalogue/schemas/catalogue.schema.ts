import { ProgressionMode } from '@prisma/client';
import { z } from 'zod';

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
export const catalogueQuerySchema = z.object({
  q: z.string().trim().min(2).max(100).optional(),
  subjectId: z.uuid().optional(),
  boardId: z.uuid().optional(),
  levelId: z.uuid().optional(),
  pacing: z.enum(ProgressionMode).optional(),
  free: booleanFlag.optional(),
  minPriceMinor: minorUnits.optional(),
  maxPriceMinor: minorUnits.optional(),
  sort: z.enum(CATALOGUE_SORTS).default('newest'),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;

export const catalogueCourseParamsSchema = z.object({ courseId: z.uuid() });
export type CatalogueCourseParams = z.infer<typeof catalogueCourseParamsSchema>;
