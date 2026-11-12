import { z } from 'zod';
import { parsePositiveMajorToMinor, parseSignedMajorToMinor, percentToBps } from '@/lib/money';
import { checkReceived } from '@/lib/admin/verification';
import { optionalText } from './fields';

/**
 * Admin forms. Money is typed as "1500" or "15,000.50" next to a currency box, so a form's schema
 * turns the pair into exact minor units (a string, never a float) in its output.
 */

const required = (message: string) => z.string().trim().min(1, message);

/** A 3-letter currency code, typed in any case. */
export const currencyBox = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'A 3-letter currency code, e.g. PKR.');

const date = (message: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** An optional date box; empty becomes undefined. */
const optionalDate = z
  .string()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Pick a date')
  .transform((v) => (v === '' ? undefined : v));

/** Adds `amountMinor` (from the typed amount and currency) or an error on the amount box. */
function withAmount<T extends { amount: string; currency: string }>(
  kind: 'positive' | 'signed',
  message: string,
) {
  return (value: T, ctx: z.RefinementCtx) => {
    const parse = kind === 'positive' ? parsePositiveMajorToMinor : parseSignedMajorToMinor;
    const amountMinor = parse(value.amount, value.currency);
    if (amountMinor === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message });
      return z.NEVER;
    }
    const { amount: _typed, ...rest } = value;
    return { ...rest, amountMinor };
  };
}

/** #85: record a payout that was already sent from the bank. */
export const payoutForm = z
  .object({
    amount: z.string(),
    currency: currencyBox,
    transactionId: required('Enter the bank transaction ID.'),
    method: optionalText,
    transferDate: date('Pick the transfer date.'),
    periodStart: optionalDate,
    periodEnd: optionalDate,
  })
  .transform(withAmount('positive', 'Enter the amount paid, above zero.'));

/** #83: a signed manual credit or debit on a teacher's ledger. */
export const adjustmentForm = z
  .object({
    amount: z.string(),
    currency: currencyBox,
    reason: required('Say why you are adjusting the balance.'),
  })
  .transform(withAmount('signed', 'Enter a non-zero amount; negative for a debit.'));

/** #82: record a refund once the money has been sent back. */
export const refundForm = (currency: string) =>
  z
    .object({
      amount: z.string(),
      currency: z.literal(currency),
      transferDate: date('Pick the transfer date.'),
      transactionId: required('Enter the bank transaction ID.'),
      reason: required('Say why the order is refunded.'),
    })
    .transform(withAmount('positive', 'Enter the amount refunded, above zero.'));

/** #29: free, or a price with a currency and a commission percentage. */
export const pricingForm = z
  .object({
    isFree: z.boolean(),
    price: z.string(),
    currency: z.string(),
    commission: z.string(),
  })
  .transform((v, ctx) => {
    if (v.isFree) return { isFree: true as const };
    const parsedCurrency = currencyBox.safeParse(v.currency);
    if (!parsedCurrency.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency'],
        message: parsedCurrency.error.issues[0]!.message,
      });
    }
    const currency = parsedCurrency.success ? parsedCurrency.data : 'PKR';
    const priceMinor = parsePositiveMajorToMinor(v.price, currency);
    if (priceMinor === null) {
      ctx.addIssue({ code: 'custom', path: ['price'], message: 'Enter a price above zero.' });
    }
    const commissionRateBps = percentToBps(v.commission);
    if (commissionRateBps === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['commission'],
        message: 'A percentage from 0 to 100.',
      });
    }
    if (!parsedCurrency.success || priceMinor === null || commissionRateBps === null)
      return z.NEVER;
    return { isFree: false as const, priceMinor, currency, commissionRateBps };
  });

/** A teacher's proposed commission when submitting a course: empty, or a percentage. */
export const proposalForm = z.object({
  proposal: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return undefined;
      const bps = percentToBps(v);
      if (bps === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a percentage between 0 and 100, e.g. 20 or 17.5',
        });
        return z.NEVER;
      }
      return bps;
    }),
});

/** Admin actions that need a written reason (suspend, reject, revoke, unpublish...). */
export const reasonForm = (minLength: number, optional: boolean) =>
  z.object({
    reason: z
      .string()
      .trim()
      .refine((v) => optional || v.length >= minLength, `Write at least ${minLength} characters.`),
  });

/** A platform setting's value, typed into a box, for the setting's type. */
export const settingValue = (
  defaultValue: number | string | boolean,
  bounds?: { min?: number; max?: number; unit?: string },
) =>
  typeof defaultValue === 'boolean'
    ? z.boolean()
    : typeof defaultValue === 'number'
      ? z
          .string()
          .trim()
          .regex(/^-?\d+(\.\d+)?$/, 'Enter a number.')
          .transform(Number)
          .refine(
            (n) =>
              (bounds?.min === undefined || n >= bounds.min) &&
              (bounds?.max === undefined || n <= bounds.max),
            `Enter a number from ${bounds?.min ?? '…'} to ${bounds?.max ?? '…'}${bounds?.unit ? ` ${bounds.unit}` : ''}.`,
          )
      : z.string();

/** Create a staff account (#15): who they are, and at least one role. */
export const staffForm = z
  .object({
    email: z
      .string()
      .trim()
      .regex(/^\S+@\S+\.\S+$/, 'Enter a valid email address'),
    fullName: z.string().trim().min(2, 'Enter their full name'),
    admin: z.boolean(),
    teacher: z.boolean(),
  })
  .transform((v, ctx) => {
    const roles = [v.admin && 'ADMIN', v.teacher && 'TEACHER'].filter(Boolean) as Array<
      'ADMIN' | 'TEACHER'
    >;
    if (roles.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['roles'], message: 'Choose at least one role.' });
      return z.NEVER;
    }
    return { email: v.email, fullName: v.fullName, roles };
  });

/** Grant free access to a course (#49). */
export const grantForm = z.object({
  studentEmail: z
    .string()
    .trim()
    .regex(/^\S+@\S+\.\S+$/, 'Enter the student’s email address'),
  courseId: required('Enter the course ID'),
  paymentChannel: required('Say how it was paid, e.g. cash or bank transfer'),
  reason: required('Say why access is granted'),
  expiresAt: optionalDate,
});

/** The audit log filters (#108): text boxes and two day boundaries. */
export const auditFilterForm = z.object({
  actorEmail: z.string().trim(),
  action: z.string().trim(),
  entityType: z.string().trim(),
  entityId: z.string().trim(),
  from: optionalDate,
  to: optionalDate,
});

const REJECTION_REASONS = [
  'NO_PAYMENT_RECEIVED',
  'AMOUNT_SHORT',
  'INVALID_TRANSACTION_ID',
  'DUPLICATE_TRANSACTION',
  'OTHER',
] as const;

/** #66: reject a payment, with a reason; "Other" needs the notes to explain it. */
export const rejectPaymentForm = z
  .object({ reason: z.enum(REJECTION_REASONS), notes: optionalText })
  .superRefine((v, ctx) => {
    if (v.reason === 'OTHER' && !v.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Explain the rejection in the notes when the reason is Other.',
      });
    }
  })
  .transform((v) => ({ rejectionReason: v.reason, notes: v.notes }));

/**
 * #64: confirm a payment from the amount seen in the bank. When it differs from the order total
 * the admin must choose what to do about the difference. Built per order: it needs the total.
 */
export const confirmPaymentForm = (totalMinor: string, currency: string) =>
  z
    .object({
      received: z.string(),
      valueDate: date('Pick the bank value date.'),
      action: z.enum(['', 'CONFIRM_ANYWAY', 'REQUEST_TOP_UP', 'REJECT']),
      notes: optionalText,
    })
    .transform((v, ctx) => {
      const amountReceivedMinor = parsePositiveMajorToMinor(v.received, currency);
      if (amountReceivedMinor === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['received'],
          message: 'Enter the amount received, above zero.',
        });
        return z.NEVER;
      }
      const check = checkReceived(totalMinor, amountReceivedMinor);
      if (check.kind !== 'exact' && v.action === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['action'],
          message: 'The amount differs from the total: choose what to do.',
        });
        return z.NEVER;
      }
      return {
        amountReceivedMinor,
        valueDate: v.valueDate,
        mismatchAction: check.kind === 'exact' || v.action === '' ? undefined : v.action,
        notes: v.notes,
      };
    });
