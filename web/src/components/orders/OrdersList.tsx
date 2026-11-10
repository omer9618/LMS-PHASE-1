'use client';

import Link from 'next/link';
import { Alert, Badge, ButtonLink, Money } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { orders as defaultOrders, type OrdersApi } from '@/lib/api/orders';
import { statusTone } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import styles from './Orders.module.css';

/** #60: the student's orders, newest first as the API returns them. */
export function OrdersList({ client = defaultOrders }: { client?: OrdersApi }) {
  const { status, user } = useSession();
  const list = useApi(user ? `orders:${user.id}` : null, () => client.list());

  if (status === 'signed-out') {
    return (
      <Alert tone="info" title="Sign in to see your orders">
        <ButtonLink href={`/login?next=${encodeURIComponent('/orders')}`}>Sign in</ButtonLink>
      </Alert>
    );
  }
  if (status === 'loading' || list.status === 'loading') {
    return (
      <p className="muted" role="status">
        Loading orders…
      </p>
    );
  }
  if (list.status === 'error') return <Alert tone="danger">{errorMessage(list.error)}</Alert>;
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
            <Badge tone={statusTone(order.status)}>{order.guidance.statusLabel}</Badge>
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
