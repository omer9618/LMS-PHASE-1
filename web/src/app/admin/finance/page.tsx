import type { Metadata } from 'next';
import { FinanceSummaryScreen } from '@/components/admin/screens/FinanceScreens';

export const metadata: Metadata = { title: 'Financial summary' };

export default function FinancialSummaryPage() {
  return <FinanceSummaryScreen />;
}
