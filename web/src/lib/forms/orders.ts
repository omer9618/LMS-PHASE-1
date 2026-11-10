import { validateForm } from '@/lib/zod-form';
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

export interface ProofFormValues {
  transactionId: string;
  amount: string;
}

export type ProofFormResult =
  | { ok: true; transactionId: string; amountClaimedMinor?: string }
  | { ok: false; errors: Partial<Record<keyof ProofFormValues, string>> };

/** Mirrors the API's proof rules (#58) for instant feedback; the API stays the authority. */
export function validateProofForm(values: ProofFormValues, currency: string): ProofFormResult {
  const checked = validateForm(proofForm(currency), values);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const { transactionId, amount } = checked.data;
  return amount
    ? { ok: true, transactionId, amountClaimedMinor: amount }
    : { ok: true, transactionId };
}
