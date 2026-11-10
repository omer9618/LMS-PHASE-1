import { z } from 'zod';

/**
 * Building blocks for the API response schemas. Each schema mirrors what the API sends (the `data`
 * of its envelope); the TypeScript types are inferred from them, so the shape is written once.
 *
 * Objects strip keys the app does not use, so the API can add fields without breaking the web app.
 * A field the app relies on that is missing or of the wrong type fails the parse (BAD_RESPONSE).
 */

/** An ISO-8601 timestamp ("2026-11-09T14:05:00.000Z"). */
export const isoDateTime = z.iso.datetime({ offset: true });

/** A calendar date ("2026-11-06"). */
export const isoDate = z.iso.date();

/** A date-only or full timestamp, for fields the API stores as dates (periods, transfer dates). */
export const dateOrDateTime = z.union([isoDateTime, isoDate]);

/** Money as a string of minor units ("150000" is PKR 1,500.00). Never a float. */
export const minorUnits = z.string().regex(/^-?\d+$/, 'Expected minor units as a whole number');

/** ISO 4217 currency code. */
export const currencyCode = z.string().length(3);

export const id = z.string().min(1);

export const namedRef = z.object({ id, name: z.string() });
export type NamedRef = z.infer<typeof namedRef>;

/** A person shown by name; the name may be unset. */
export const personRef = z.object({ id, fullName: z.string().nullable() });

/** A page of results with a total. */
export function paged<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}
export type Paged<T> = { items: T[]; total: number; limit: number; offset: number };

/** A response whose body the caller does not read (logout, delete, register). */
export const ignored = z.unknown();

/**
 * An enum the API may extend: known values autocomplete, unknown ones still parse as strings so a
 * new value on the API never breaks a page (the UI shows it as-is).
 */
export function openEnum<const T extends readonly [string, ...string[]]>(_known: T) {
  return z.custom<T[number] | (string & {})>((value) => typeof value === 'string', {
    message: 'Expected a string',
  });
}
