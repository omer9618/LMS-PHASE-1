import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderDetail } from '@/components/orders/OrderDetail';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const [{ orderId }, { placed }] = await Promise.all([params, searchParams]);
  if (!UUID.test(orderId)) notFound();
  return (
    <div className="page">
      <OrderDetail orderId={orderId} justPlaced={placed === '1'} />
    </div>
  );
}
