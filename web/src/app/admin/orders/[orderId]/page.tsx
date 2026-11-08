import type { Metadata } from 'next';
import { OrderDetailScreen } from '@/components/admin/screens/OrderScreens';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderDetailScreen orderId={orderId} />;
}
