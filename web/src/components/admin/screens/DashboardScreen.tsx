'use client';

import Link from 'next/link';
import { getDashboard } from '@/lib/api/admin';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { formatDateTime } from '../kit';
import { Loadable, PageHeader } from '@/components/ui';

/** #102: what needs an admin now, with links into each queue. */
export function DashboardScreen() {
  const dashboard = useApi('admin-dashboard', (signal) => getDashboard(signal));
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Queues waiting for an admin, oldest work first inside each queue."
      />
      <Loadable state={dashboard} what="the dashboard">
        {(data) => {
          const tiles: Array<{ label: string; value: number | null; href: string }> = [
            {
              label: 'Payments to verify',
              value: data.queues.paymentVerificationsPending,
              href: '/admin/verification',
            },
            {
              label: 'Courses awaiting approval',
              value: data.queues.coursesPendingApproval,
              href: '/admin/courses',
            },
            {
              label: 'Teacher applications open',
              value: data.queues.teacherApplicationsOpen,
              href: '/admin/applications',
            },
            {
              label: 'Open payout concerns',
              value: data.queues.payoutConcerns,
              href: '/admin/concerns',
            },
            {
              label: 'Enrollments granted today',
              value: data.today.enrollmentsGranted,
              href: '/admin/enrollments',
            },
          ];
          return (
            <>
              <p>
                <strong>{data.needsAttention}</strong> item{data.needsAttention === 1 ? '' : 's'}{' '}
                need attention.
              </p>
              <ul className={styles.tiles}>
                {tiles.map((tile) => (
                  <li key={tile.label}>
                    <Link href={tile.href} className={styles.tile}>
                      <span className={styles.tileValue}>{tile.value ?? '—'}</span>
                      <span className={styles.tileLabel}>{tile.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Updated {formatDateTime(data.generatedAt)}. &ldquo;Today&rdquo; starts at midnight
                UTC.
              </p>
            </>
          );
        }}
      </Loadable>
    </>
  );
}
