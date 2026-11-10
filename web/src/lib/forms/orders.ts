import { z } from 'zod';
import { minorUnitExponent, parseMajorToMinor } from '@/lib/money';

/**
 * A payment proof (#58): the transaction ID, and optionally the amount the student transferred,
 * typed as "15000" or "15,000.50". The currency decides how many decimals the amount has, so the
 * schema is built per order. Amounts stay exact strings of minor units, never floats.
 */
export function proofForm(currency: string) {
  const exponent = minorUnitExponent(currency);
  return z.object({
    transactionId: z
      .string()
      .trim()
      .min(2, 'Enter the transaction ID from your bank')
      .max(120, 'At most 120 characters'),
    amount: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === '') return undefined;
        const minor = parseMajorToMinor(value, exponent);
        if (minor === null || /^0+$/.test(minor)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter the amount you transferred, such as 15000 or 15,000.50',
          });
          return z.NEVER;
        }
        return minor;
      }),
  });
}
