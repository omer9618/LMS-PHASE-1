import type { Metadata } from 'next';
import { PayoutDetailScreen } from '@/components/admin/screens/FinanceScreens';

export const metadata: Metadata = { title: 'Payout' };

export default async function PayoutPage({ params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;
  return <PayoutDetailScreen payoutId={payoutId} />;
}
