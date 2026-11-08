import type { Metadata } from 'next';
import { VerificationScreen } from '@/components/admin/screens/VerificationScreen';

export const metadata: Metadata = { title: 'Payment verification' };

export default function PaymentVerificationPage() {
  return <VerificationScreen />;
}
