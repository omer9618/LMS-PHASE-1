import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptView } from '@/components/orders/ReceiptView';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: 'Receipt' };

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) notFound();
  return (
    <div className="page">
      <ReceiptView orderId={orderId} />
    </div>
  );
}
