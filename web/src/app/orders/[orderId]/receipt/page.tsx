import type { Metadata } from 'next';
import { ReceiptView } from '@/components/orders/ReceiptView';
import { requireId } from '@/lib/route-params';

export const metadata: Metadata = { title: 'Receipt' };

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  requireId(orderId);
  return (
    <div className="page">
      <ReceiptView orderId={orderId} />
    </div>
  );
}
