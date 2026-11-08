import type { Metadata } from 'next';
import { ConcernsScreen } from '@/components/admin/screens/FinanceScreens';

export const metadata: Metadata = { title: 'Payout concerns' };

export default function PayoutConcernsPage() {
  return <ConcernsScreen />;
}
