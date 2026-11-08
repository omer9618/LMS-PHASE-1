import type { Metadata } from 'next';
import { CartView } from '@/components/orders/CartView';

export const metadata: Metadata = { title: 'Your cart' };

export default function CartPage() {
  return (
    <div className="page">
      <CartView />
    </div>
  );
}
