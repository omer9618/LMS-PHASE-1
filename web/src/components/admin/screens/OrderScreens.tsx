'use client';

import Link from 'next/link';
import { type FormEvent } from 'react';
import {
  Alert,
  Button,
  Facts,
  Input,
  Loadable,
  Money,
  PageHeader,
  Section,
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import { adminFinanceApi, type AdminOrder } from '@/lib/api/admin-finance';
import { formatBps } from '@/lib/money';
import { todayIso } from '@/lib/format';
import { minorToMajorInput, minorUnitExponent } from '@/lib/money';
import { useQuery } from '@tanstack/react-query';
import styles from '../Admin.module.css';
import { MutationStatus } from '@/components/ui';
import { useMutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';
import { DecisionPanel, OrderLookup, ProofList } from './VerificationScreen';
import { humanize } from '@/lib/format';
import { refundForm } from '@/lib/forms/admin';
import { useZodForm } from '@/lib/use-zod-form';

/** Orders are reached from the verification queue, statements, or by ID. */
export function OrdersScreen() {
  return (
    <>
      <PageHeader
        eyebrow="Purchases"
        title="Orders"
        description="Open an order by its ID. Orders waiting for a decision are in Payment verification."
      />
      <OrderLookup />
      <p>
        <Link href="/admin/verification">Go to the verification queue</Link>
      </p>
    </>
  );
}

/** One order: frozen line snapshots, proofs, decisions, and (once verified) the refund form. */
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const order = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: ({ signal }) => adminFinanceApi.getOrder(orderId, signal),
  });
  return (
    <Loadable state={order} what="the order">
      {(o) => (
        <>
          <PageHeader
            eyebrow="Purchases · one order"
            title={`Order ${o.paymentReference}`}
            description={
              <>
                <Link href={`/admin/users/${o.student.id}`}>
                  {o.student.fullName || o.student.email}
                </Link>{' '}
                · placed {formatDateTime(o.createdAt)}
              </>
            }
            actions={<StatusBadge status={o.status} />}
          />
          <Section title="Summary">
            <Facts
              items={[
                ['Total', <Money key="t" minor={o.totalMinor} currency={o.currency} />],
                ['Verified', formatDateTime(o.verifiedAt)],
                ['Expires', formatDateTime(o.expiresAt)],
              ]}
            />
          </Section>
          <Section title="Courses (frozen at order time)">
            <Table<AdminOrder['items'][number]>
              caption="Order lines"
              hideCaption
              rows={o.items}
              rowKey={(i) => i.id}
              columns={[
                {
                  key: 'course',
                  header: 'Course',
                  rowHeader: true,
                  cell: (i) => <Link href={`/admin/courses/${i.course.id}`}>{i.course.title}</Link>,
                },
                {
                  key: 'teacher',
                  header: 'Teacher',
                  cell: (i) => (
                    <Link href={`/admin/teachers/${i.teacher.id}`}>
                      {i.teacher.fullName || i.teacher.email}
                    </Link>
                  ),
                },
                {
                  key: 'price',
                  header: 'Price',
                  numeric: true,
                  cell: (i) => <Money minor={i.priceMinor} currency={o.currency} />,
                },
                {
                  key: 'rate',
                  header: 'Commission',
                  numeric: true,
                  cell: (i) => formatBps(i.commissionRateBps),
                },
                {
                  key: 'commission',
                  header: 'Platform',
                  numeric: true,
                  cell: (i) => <Money minor={i.commissionMinor} currency={o.currency} />,
                },
                {
                  key: 'net',
                  header: 'Teacher',
                  numeric: true,
                  cell: (i) => <Money minor={i.netTeacherMinor} currency={o.currency} />,
                },
              ]}
            />
          </Section>
          <Section title="Payment proofs">
            {o.duplicateTransactionIdWarnings.map((w) => (
              <Alert
                key={w.transactionId}
                tone="warning"
                title="Transaction ID used on another order"
              >
                <p>{w.message}</p>
              </Alert>
            ))}
            <ProofList proofs={o.proofs} currency={o.currency} />
          </Section>
          <Section title="Decisions">
            {o.verifications.length === 0 ? (
              <p className="muted">No decision yet.</p>
            ) : (
              <ul className={styles.list}>
                {o.verifications.map((v) => (
                  <li key={v.id}>
                    {formatDateTime(v.verifiedAt)}: {humanize(v.outcome)}
                    {v.amountReceivedMinor && (
                      <>
                        {' '}
                        · received {<Money minor={v.amountReceivedMinor} currency={o.currency} />}
                      </>
                    )}
                    {v.mismatchAction && <> · {humanize(v.mismatchAction)}</>}
                    {v.rejectionReason && <> · {humanize(v.rejectionReason)}</>}
                    {v.notes && <> · “{v.notes}”</>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {o.status === 'PROOF_SUBMITTED' && (
            <Section title="Decide">
              <DecisionPanel
                orderId={o.id}
                totalMinor={o.totalMinor}
                currency={o.currency}
                suggestedMinor={o.totalMinor}
                onDecided={() => void order.refetch()}
              />
            </Section>
          )}
          {o.status === 'VERIFIED' && (
            <RefundForm order={o} onRefunded={() => void order.refetch()} />
          )}
          <p className="muted">
            <Link href={`/admin/audit?entityId=${o.id}`}>Audit history for this order</Link>
          </p>
        </>
      )}
    </Loadable>
  );
}

/** #82: record a refund already paid back to the student. Revokes access and debits teachers. */
function RefundForm({ order, onRefunded }: { order: AdminOrder; onRefunded: () => void }) {
  const form = useZodForm(refundForm(order.currency), {
    amount: minorToMajorInput(order.totalMinor, minorUnitExponent(order.currency)),
    currency: order.currency,
    transferDate: todayIso(),
    transactionId: '',
    reason: '',
  });
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = form.check();
    if (!body) return;
    const ok = await mutation.run(
      () =>
        adminFinanceApi.recordRefund(order.id, {
          amountMinor: body.amountMinor,
          transferDate: body.transferDate,
          transactionId: body.transactionId,
          reason: body.reason,
        }),
      'Refund recorded. Access was revoked and the teachers were debited.',
    );
    if (ok) onRefunded();
  }

  return (
    <Section title="Record a refund">
      <p className="muted">
        Record a refund once the money has been sent back. The student loses access to every course
        in the order.
      </p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.filters}>
          <Input
            label={`Amount refunded (${order.currency})`}
            inputMode="decimal"
            {...form.bind('amount')}
          />
          <Input label="Transfer date" type="date" required {...form.bind('transferDate')} />
          <Input label="Bank transaction ID" required {...form.bind('transactionId')} />
        </div>
        <Textarea label="Reason" required rows={2} {...form.bind('reason')} />
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" variant="danger" loading={mutation.pending}>
            Record refund
          </Button>
        </div>
      </form>
    </Section>
  );
}
