'use client';

import Link from 'next/link';
import { Alert, Badge, ButtonLink, LoadError, Money, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { orders as defaultOrders, type OrdersApi } from '@/lib/api/orders';
import { orderStatusLabel } from '@/lib/orders/display';
import { statusTone } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
import styles from './Orders.module.css';

/** #60: the student's orders, newest first as the API returns them. */
export function OrdersList({ client = defaultOrders }: { client?: OrdersApi }) {
  const { status, user } = useSession();
  const list = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: () => client.list(),
    enabled: user !== null,
  });

  if (status === 'signed-out') {
    return (
      <Alert tone="info" title="Sign in to see your orders">
        <ButtonLink href={`/login?next=${encodeURIComponent('/orders')}`}>Sign in</ButtonLink>
      </Alert>
    );
  }
  if (status === 'loading' || list.status === 'pending') {
    return <Skeleton label="Loading orders…" />;
  }
  if (list.status === 'error') {
    return (
      <LoadError title="Could not load your orders" onRetry={() => void list.refetch()}>
        {errorMessage(list.error)}
      </LoadError>
    );
  }
  if (list.data.length === 0) {
    return (
      <div className="stack">
        <p>You have not placed any orders yet.</p>
        <p>
          <ButtonLink href="/courses">Browse courses</ButtonLink>
        </p>
      </div>
    );
  }
  return (
    <ul className={styles.orderList}>
      {list.data.map((order) => (
        <li key={order.id} className={styles.card}>
          <div className={styles.titleRow}>
            <Link href={`/orders/${encodeURIComponent(order.id)}`} className={styles.orderLink}>
              <code>{order.paymentReference}</code>
            </Link>
            <Badge tone={statusTone(order.status)}>{orderStatusLabel(order)}</Badge>
          </div>
          <p>{order.items.map((i) => i.courseTitle).join(', ')}</p>
          <p className={styles.orderMeta}>
            <strong>
              <Money minor={order.totalMinor} currency={order.currency} />
            </strong>
            <span className="muted">{formatDateTime(order.createdAt)}</span>
          </p>
          {order.guidance.canSubmitProof && order.status !== 'PROOF_SUBMITTED' && (
            <p>
              <ButtonLink href={`/orders/${encodeURIComponent(order.id)}`} size="sm">
                {order.status === 'REJECTED' ? 'Resubmit payment' : 'Pay and submit proof'}
              </ButtonLink>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
