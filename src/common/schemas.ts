import { z } from 'zod';

// Building blocks for request schemas, shared by every module.

/** Route params that are all UUIDs: `uuidParams('courseId', 'lessonId')`. */
export function uuidParams<const K extends string>(...keys: K[]) {
  return z.object(Object.fromEntries(keys.map((key) => [key, z.uuid()])) as Record<K, z.ZodUUID>);
}

/** `limit` / `offset` query fields; spread into a query schema: `{ ...paging({ max: 100 }) }`. */
export function paging(options: { max: number; default?: number; maxOffset?: number }) {
  const offset = z.coerce.number().int().min(0);
  return {
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(options.max)
      .default(options.default ?? 50),
    offset: (options.maxOffset === undefined ? offset : offset.max(options.maxOffset)).default(0),
  };
}
