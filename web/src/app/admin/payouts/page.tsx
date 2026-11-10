import type { Metadata } from 'next';
import { PayoutRunScreen } from '@/components/admin/screens/PayoutRunScreen';

export const metadata: Metadata = { title: 'Payout run' };

export default function PayoutRunPage() {
  return <PayoutRunScreen />;
}
