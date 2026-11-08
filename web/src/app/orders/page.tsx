import type { Metadata } from 'next';
import { OrdersList } from '@/components/orders/OrdersList';

export const metadata: Metadata = { title: 'My orders' };

export default function OrdersPage() {
  return (
    <div className="page stack">
      <h1>My orders</h1>
      <OrdersList />
    </div>
  );
}
