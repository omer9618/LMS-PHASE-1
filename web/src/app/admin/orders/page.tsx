import type { Metadata } from 'next';
import { OrdersScreen } from '@/components/admin/screens/OrderScreens';

export const metadata: Metadata = { title: 'Orders' };

export default function OrdersPage() {
  return <OrdersScreen />;
}
