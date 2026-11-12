import { Icon } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { StudentOrder } from '@/lib/api/orders';
import styles from './Orders.module.css';

/** Which of the four steps the order is on (0-based); 4 means all done. null: no progress to show. */
export function currentStep(status: StudentOrder['status']): number | null {
  switch (status) {
    case 'PENDING':
    case 'REJECTED':
      return 1;
    case 'PROOF_SUBMITTED':
      return 2;
    case 'VERIFIED':
      return 4;
    default:
      return null;
  }
}

/**
 * The student's route from order to lessons: placed, pay and upload proof, we verify, lessons
 * unlock. The same four steps as the design's order screen, so "what now?" is answered at a glance.
 */
export function OrderSteps({
  order,
  turnaroundHours,
}: {
  order: StudentOrder;
  turnaroundHours: number;
}) {
  const current = currentStep(order.status);
  if (current === null) return null;
  const expires = formatDateTime(order.paymentInstructions.expiresAt);
  const steps = [
    { title: 'Order placed', note: formatDateTime(order.createdAt) },
    {
      title: 'Pay and upload proof',
      note: order.status === 'REJECTED' ? 'Payment not accepted' : expires ? `By ${expires}` : '',
    },
    { title: 'We verify', note: `Within ${turnaroundHours} hours` },
    { title: 'Lessons unlock', note: 'Receipt by email' },
  ];
  return (
    <ol className={styles.steps} aria-label="Order progress">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step.title}
            className={`${styles.step} ${done ? styles.stepDone : ''} ${active ? styles.stepCurrent : ''}`}
            aria-current={active ? 'step' : undefined}
          >
            <span className={styles.stepMark} aria-hidden="true">
              {done ? <Icon name="check" /> : index + 1}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>
                {step.title}
                {done && <span className="visually-hidden"> (done)</span>}
              </span>
              {step.note && <span className={styles.stepNote}>{step.note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
