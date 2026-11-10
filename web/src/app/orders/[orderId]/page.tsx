import type { Metadata } from 'next';
import { OrderDetail } from '@/components/orders/OrderDetail';
import { requireId } from '@/lib/route-params';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const [{ orderId }, { placed }] = await Promise.all([params, searchParams]);
  requireId(orderId);
  return (
    <div className="page">
      <OrderDetail orderId={orderId} justPlaced={placed === '1'} />
    </div>
  );
}
