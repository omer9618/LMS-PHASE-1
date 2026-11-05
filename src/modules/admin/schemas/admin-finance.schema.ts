import { z } from 'zod';

/**
 * #104 (FR-12.3): Optional UTC date range query parameters (`from` and `to`, inclusive `YYYY-MM-DD`)
 * for the admin financial summary view.
 */
export const financialSummaryQuerySchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>;
