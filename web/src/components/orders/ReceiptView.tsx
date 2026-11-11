'use client';

import Link from 'next/link';
import { Alert, Button, Icon, Money } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { orders as defaultOrders, type OrdersApi } from '@/lib/api/orders';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import styles from './Orders.module.css';

/** #62: the receipt of a confirmed order, printable (or saved as PDF from the print dialog). */
export function ReceiptView({
  orderId,
  client = defaultOrders,
}: {
  orderId: string;
  client?: OrdersApi;
}) {
  const receipt = useQuery({
    queryKey: ['receipt', orderId],
    queryFn: () => client.receipt(orderId),
  });
  const back = (
    <p className={styles.noPrint}>
      <Link href={`/orders/${encodeURIComponent(orderId)}`}>
        <Icon name="arrowLeft" /> Back to the order
      </Link>
    </p>
  );

  if (receipt.status === 'pending') {
    return (
      <p className="muted" role="status">
        Loading receipt…
      </p>
    );
  }
  if (receipt.status === 'error') {
    return (
      <div className="stack">
        {back}
        <Alert tone={receipt.error.name === 'ORDER_REFUSED' ? 'info' : 'danger'}>
          {receipt.error.name === 'ORDER_REFUSED'
            ? 'A receipt is issued once your payment is confirmed.'
            : errorMessage(receipt.error)}
        </Alert>
      </div>
    );
  }

  const r = receipt.data;
  return (
    <div className="stack">
      {back}
      <article className={styles.receipt} aria-labelledby="receipt-heading">
        <header className={styles.titleRow}>
          <div>
            <p className="eyebrow">Payment confirmed</p>
            <h1 id="receipt-heading">Receipt</h1>
          </div>
          <span className="mono muted">No. {r.receiptNumber}</span>
        </header>
        <dl className={`${styles.receiptFacts} eyebrow-terms`}>
          <div>
            <dt>Issued</dt>
            <dd>{formatDateTime(r.issuedAt)}</dd>
          </div>
          <div>
            <dt>Payment reference</dt>
            <dd>
              <code>{r.paymentReference}</code>
            </dd>
          </div>
          <div>
            <dt>Billed to</dt>
            <dd>
              {r.student.fullName && <>{r.student.fullName}, </>}
              {r.student.email}
            </dd>
          </div>
        </dl>
        <ul className={styles.lines}>
          {r.items.map((item) => (
            <li key={item.courseId}>
              <span>
                {item.courseTitle}
                {item.teacherName && <span className="muted"> · {item.teacherName}</span>}
              </span>
              <strong>
                <Money minor={item.priceMinor} currency={r.currency} />
              </strong>
            </li>
          ))}
        </ul>
        <div className={styles.totalRow}>
          <span>Total paid</span>
          <strong className={styles.bigValue}>
            <Money minor={r.totalMinor} currency={r.currency} />
          </strong>
        </div>
      </article>
      <p className={styles.noPrint}>
        <Button variant="secondary" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </p>
    </div>
  );
}
