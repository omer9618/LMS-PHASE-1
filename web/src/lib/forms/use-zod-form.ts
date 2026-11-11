'use client';

import { useState, type ChangeEvent } from 'react';
import type { z } from 'zod';
import { validateForm, type FieldErrors } from './validate';

/**
 * Form state for a zod-validated form: the values (as text boxes hold them), the errors by field,
 * `bind(key)` for an Input/Textarea/Select, and `check()` which validates and returns the parsed
 * request body, or null after setting the errors. Every form uses this, so none keeps its own
 * validation code.
 */
export function useZodForm<S extends z.ZodType>(schema: S, initial: z.input<S>) {
  type Values = z.input<S>;
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v: Values) => ({ ...(v as object), [key]: value }) as Values);

  /** Props for a text control: name, value, error and onChange. */
  const bind = (key: keyof Values & string) => ({
    name: key,
    value: String(values[key] ?? ''),
    error: errors[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, event.target.value as Values[typeof key]),
  });

  /** Props for a checkbox. */
  const bindCheck = (key: keyof Values & string) => ({
    name: key,
    checked: Boolean(values[key]),
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      set(key, event.target.checked as Values[typeof key]),
  });

  function check(): z.output<S> | null {
    const result = validateForm(schema, values);
    setErrors(result.ok ? {} : result.errors);
    return result.ok ? result.data : null;
  }

  return { values, set, setValues, errors, setErrors, bind, bindCheck, check };
}
