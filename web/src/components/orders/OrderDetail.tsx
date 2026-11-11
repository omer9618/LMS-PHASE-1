'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, ButtonLink, PageHeader, SplitLayout, Icon, Money } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import {
  orders as defaultOrders,
  type OrdersApi,
  type StudentOrder,
  type SubmittedProof,
} from '@/lib/api/orders';
import { humaniseGuidance } from '@/lib/order-display';
import { statusTone } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { PaymentInstructions } from './PaymentInstructions';
import { ProofForm } from './ProofForm';
import styles from './Orders.module.css';

export interface OrderDetailProps {
  orderId: string;
  /** Just placed: show the confirmation banner. */
  justPlaced?: boolean;
  client?: OrdersApi;
}

/**
 * #55, #58, #60, #62, #65, #66: one order. Status in the student's words and what happens next,
 * the admin's last decision (rejection reason, or the top-up shortfall), how to pay, the proof
 * form (also for resubmitting after a rejection), proofs sent so far, and the receipt once paid.
 */
export function OrderDetail({
  orderId,
  justPlaced = false,
  client = defaultOrders,
}: OrderDetailProps) {
  const loaded = useQuery({ queryKey: ['order', orderId], queryFn: () => client.get(orderId) });
  const [latest, setLatest] = useState<SubmittedProof | null>(null);

  if (loaded.status === 'pending') {
    return (
      <p className="muted" role="status">
        Loading order…
      </p>
    );
  }
  if (loaded.status === 'error') {
    return (
      <Alert tone="danger" title="The order could not be loaded">
        <p>{errorMessage(loaded.error)}</p>
        <p>
          <Link href="/orders">Back to my orders</Link>
        </p>
      </Alert>
    );
  }

  const order: StudentOrder = latest?.order ?? loaded.data;
  const { guidance, lastDecision } = order;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <Link href="/orders">
            <Icon name="arrowLeft" /> My orders
          </Link>
        }
        title={
          <>
            Order <code>{order.paymentReference}</code>
          </>
        }
        actions={<Badge tone={statusTone(order.status)}>{guidance.statusLabel}</Badge>}
      />

      {justPlaced && order.status === 'PENDING' && !latest && (
        <Alert tone="success" title="Order placed">
          Your prices are fixed. Transfer the amount below with the reference, then tell us the
          transaction ID.
        </Alert>
      )}

      {latest && (
        <Alert tone="success" title="Payment details received">
          Thank you. We will check your transfer and email you when it is confirmed.
        </Alert>
      )}
      {latest?.duplicateTransactionIdWarning && (
        <Alert tone="warning" title="Transaction ID used before">
          {latest.duplicateTransactionIdWarning.message} If that was a mistake, submit the correct
          ID.
        </Alert>
      )}

      {lastDecision?.kind === 'REJECTED' && order.status === 'REJECTED' && (
        <Alert tone="danger" title="Your payment was not accepted">
          <p>
            <strong>Reason:</strong> {lastDecision.reason}
          </p>
          {lastDecision.notes && <p>{lastDecision.notes}</p>}
        </Alert>
      )}
      {lastDecision?.kind === 'TOP_UP_REQUESTED' && order.status === 'PENDING' && (
        <Alert tone="warning" title="Top-up needed">
          We received less than the order total. Please transfer the remaining{' '}
          <strong>
            <Money minor={lastDecision.shortfallMinor} currency={order.currency} />
          </strong>{' '}
          with the same reference.
        </Alert>
      )}

      <SplitLayout
        main={
          <>
            <section aria-labelledby="next-heading" className={styles.card}>
              <h2 id="next-heading">What happens next</h2>
              <p>{humaniseGuidance(guidance.whatHappensNext)}</p>
              {order.status === 'VERIFIED' && (
                <p className={styles.actions}>
                  <ButtonLink href={`/orders/${encodeURIComponent(order.id)}/receipt`}>
                    View receipt
                  </ButtonLink>
                  <ButtonLink href="/dashboard" variant="secondary">
                    Go to my learning
                  </ButtonLink>
                </p>
              )}
            </section>

            <section aria-labelledby="items-heading" className={styles.card}>
              <h2 id="items-heading">Courses</h2>
              <ul className={styles.lines}>
                {order.items.map((item) => (
                  <li key={item.courseId}>
                    <span>
                      {order.status === 'VERIFIED' ? (
                        <Link href={`/learn/${encodeURIComponent(item.courseId)}`}>
                          {item.courseTitle}
                        </Link>
                      ) : (
                        item.courseTitle
                      )}
                      {item.teacherName && <span className="muted"> · {item.teacherName}</span>}
                    </span>
                    <strong>
                      <Money minor={item.priceMinor} currency={order.currency} />
                    </strong>
                  </li>
                ))}
              </ul>
              <div className={styles.totalRow}>
                <span>Total</span>
                <strong>
                  <Money minor={order.totalMinor} currency={order.currency} />
                </strong>
              </div>
              <p className="muted">Placed {formatDateTime(order.createdAt)}</p>
            </section>

            {order.proofs.length > 0 && (
              <section aria-labelledby="proofs-heading" className={styles.card}>
                <h2 id="proofs-heading">Payment details you sent</h2>
                <ul className={styles.lines}>
                  {order.proofs.map((proof) => (
                    <li key={proof.id}>
                      <span>
                        <code>{proof.transactionId}</code>
                        {proof.amountClaimedMinor && (
                          <>
                            {' '}
                            · <Money minor={proof.amountClaimedMinor} currency={order.currency} />
                          </>
                        )}
                        {proof.hasFile && proof.fileUrl && (
                          <>
                            {' '}
                            ·{' '}
                            <a href={proof.fileUrl} target="_blank" rel="noreferrer">
                              attachment
                            </a>
                          </>
                        )}
                      </span>
                      <span className="muted">{formatDateTime(proof.submittedAt)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        }
        aside={
          <>
            {(order.status === 'PENDING' || order.status === 'REJECTED') && (
              <PaymentInstructions instructions={order.paymentInstructions} />
            )}

            {guidance.canSubmitProof && (
              <ProofForm order={order} client={client} onSubmitted={setLatest} />
            )}
          </>
        }
      />
    </div>
  );
}
