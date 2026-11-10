'use client';

import { Loadable, PageHeader, Section, StatGrid, StatTile } from '@/components/ui';
import { adminApi } from '@/lib/api/admin';
import { adminFinanceApi } from '@/lib/api/admin-finance';
import { useApi } from '@/lib/use-api';
import { formatDateTime } from '../kit';

/** 3070 → "51h 10m". */
export function formatWait(minutes: number | null): string {
  if (minutes === null) return '—';
  const whole = Math.floor(minutes);
  return `${Math.floor(whole / 60)}h ${String(whole % 60).padStart(2, '0')}m`;
}

/** #102: what needs an admin now, with links into each queue. */
export function DashboardScreen() {
  const dashboard = useApi('admin-dashboard', (signal) => adminApi.getDashboard(signal));
  // Waiting times for the payment queue; the tiles still show without it.
  const metrics = useApi('admin-dashboard-metrics', (signal) =>
    adminFinanceApi.getVerificationMetrics(signal),
  );
  const queue = metrics.status === 'success' ? metrics.data : null;

  return (
    <>
      <PageHeader
        eyebrow="Queues waiting for an admin"
        title="Dashboard"
        description="Oldest work first inside each queue. Payments past the turnaround are marked."
      />
      <Loadable state={dashboard} what="the dashboard">
        {(data) => {
          const { queues } = data;
          const late = queue?.overTurnaroundCount ?? 0;
          return (
            <>
              <StatGrid label="Queues">
                <StatTile
                  tone={late > 0 ? 'danger' : 'neutral'}
                  label="Payments to verify"
                  value={queues.paymentVerificationsPending ?? '—'}
                  note={
                    queue && queue.queueSize > 0
                      ? `Oldest ${formatWait(queue.oldestWaitingMinutes)} · ${late} past ${queue.turnaroundHours}h`
                      : undefined
                  }
                  action={{ href: '/admin/verification', label: 'Open queue' }}
                />
                <StatTile
                  label="Courses to approve"
                  value={queues.coursesPendingApproval}
                  action={{ href: '/admin/courses', label: 'Review' }}
                />
                <StatTile
                  label="Teacher applications"
                  value={queues.teacherApplicationsOpen}
                  action={{ href: '/admin/applications', label: 'Review' }}
                />
                <StatTile
                  tone={(queues.payoutConcerns ?? 0) > 0 ? 'warning' : 'neutral'}
                  label="Payout concerns"
                  value={queues.payoutConcerns ?? '—'}
                  action={{ href: '/admin/concerns', label: 'Look into them' }}
                />
              </StatGrid>
              <Section title="Today">
                <StatGrid label="Today">
                  <StatTile label="Items needing attention" value={data.needsAttention} />
                  <StatTile
                    label="Enrollments granted today"
                    value={data.today.enrollmentsGranted}
                    action={{ href: '/admin/enrollments', label: 'See enrollments' }}
                  />
                </StatGrid>
                <p className="muted">
                  Updated {formatDateTime(data.generatedAt)}. &ldquo;Today&rdquo; starts at midnight
                  UTC.
                </p>
              </Section>
            </>
          );
        }}
      </Loadable>
    </>
  );
}
