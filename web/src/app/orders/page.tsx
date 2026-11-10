import { PageHeader } from '@/components/ui';
import type { Metadata } from 'next';
import { OrdersList } from '@/components/orders/OrdersList';

export const metadata: Metadata = { title: 'My orders' };

export default function OrdersPage() {
  return (
    <div className="page stack">
      <PageHeader eyebrow="Purchases · newest first" title="My orders" />
      <OrdersList />
    </div>
  );
}
