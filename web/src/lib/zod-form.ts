import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

/** The first message, for a form that shows one error line instead of one per field. */
export function firstError(errors: FieldErrors): string {
  return Object.values(errors)[0] ?? 'Check the form.';
}

/**
 * Checks a form's values with a zod schema before anything is sent. Returns the parsed data, or
 * one message per field (the first issue for each; nested paths are joined with dots, so
 * `options.1.text` addresses the second option's text).
 */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
