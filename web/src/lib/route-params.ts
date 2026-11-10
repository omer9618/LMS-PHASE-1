import { notFound } from 'next/navigation';
import { z } from 'zod';

const id = z.guid();

/** A route's id parameter, or a 404 when it is not an id (so a typo never reaches the API). */
export function requireId(value: string): string {
  if (!id.safeParse(value).success) notFound();
  return value;
}
