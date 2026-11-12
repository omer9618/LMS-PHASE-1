'use client';

import { Alert, BackLink, Button, Money, Skeleton } from '@/components/ui';
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
    <div className={styles.noPrint}>
      <BackLink href={`/orders/${encodeURIComponent(orderId)}`}>The order</BackLink>
    </div>
  );

  if (receipt.status === 'pending') {
    return <Skeleton label="Loading receipt…" />;
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
        <header>
          <p className="eyebrow">
            Payment confirmed · No. <span className="mono">{r.receiptNumber}</span>
          </p>
          <h1 id="receipt-heading">Receipt</h1>
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
              {r.student.fullName && (
                <>
                  {r.student.fullName}
                  <br />
                </>
              )}
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
