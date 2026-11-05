'use client';

import Link from 'next/link';
import { Alert, Badge, Button, ButtonLink, type BadgeTone } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { AccessState, DashboardEntry } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import styles from './Dashboard.module.css';

const ACCESS: Record<AccessState, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'warning' },
  REVOKED: { label: 'Access removed', tone: 'danger' },
  NONE: { label: 'No access', tone: 'neutral' },
};

/** Where a student continues a course. The player itself is another workstream's route. */
export function learnHref(courseId: string): string {
  return `/learn/${courseId}`;
}

/** Active courses first, then the rest; most recently granted first within each group. */
export function sortEntries(entries: DashboardEntry[]): DashboardEntry[] {
  return [...entries].sort((a, b) => {
    const activeA = a.access === 'ACTIVE' ? 0 : 1;
    const activeB = b.access === 'ACTIVE' ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    return (b.grantedAt ?? '').localeCompare(a.grantedAt ?? '');
  });
}

/** #52: the student's courses with completion. */
export function StudentDashboard() {
  const { status, user } = useSession();
  const enrollments = useApi(user ? `dashboard:${user.id}` : null, (signal) =>
    api.get<DashboardEntry[]>('/me/enrollments', undefined, signal),
  );

  if (status === 'loading') return <p role="status">Loading…</p>;
  if (!user) {
    return (
      <div className="stack">
        <h1>My learning</h1>
        <p>
          <Link href="/login?next=/dashboard">Sign in</Link> to see your courses.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>My learning</h1>
      {enrollments.status === 'loading' && <p role="status">Loading your courses…</p>}
      {enrollments.status === 'error' && (
        <Alert tone="danger" title="Could not load your courses">
          <p>{errorMessage(enrollments.error)}</p>
          <Button size="sm" variant="secondary" onClick={enrollments.reload}>
            Try again
          </Button>
        </Alert>
      )}
      {enrollments.status === 'success' && enrollments.data.length === 0 && (
        <div className={styles.empty}>
          <p>You are not enrolled in any course yet.</p>
          <ButtonLink href="/courses">Browse courses</ButtonLink>
        </div>
      )}
      {enrollments.status === 'success' && enrollments.data.length > 0 && (
        <ul className={styles.list}>
          {sortEntries(enrollments.data).map((entry) => (
            <li key={entry.id}>
              <EnrollmentCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnrollmentCard({ entry }: { entry: DashboardEntry }) {
  const access = ACCESS[entry.access];
  const percent = Math.max(0, Math.min(100, Math.round(entry.completionPercent ?? 0)));
  const titleId = `course-${entry.id}`;
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <h2 id={titleId} className={styles.title}>
          {entry.course.title}
        </h2>
        <Badge tone={access.tone}>{access.label}</Badge>
      </div>
      <p className={styles.meta}>
        {[entry.course.subject?.name, entry.course.teacher?.fullName].filter(Boolean).join(' · ')}
      </p>
      <div className={styles.progressRow}>
        <progress
          className={styles.progress}
          max={100}
          value={percent}
          aria-label={`${entry.course.title}: ${percent}% complete`}
        />
        <span className={styles.percent}>
          {percent}% complete
          {entry.totalLessons !== undefined && (
            <span className="muted">
              {' '}
              ({entry.completedLessons ?? 0} of {entry.totalLessons} lessons)
            </span>
          )}
        </span>
      </div>
      {entry.expiresAt && (
        <p className={styles.meta}>
          {entry.access === 'ACTIVE' ? 'Access until' : 'Access ended'}{' '}
          {formatDate(entry.expiresAt)}
        </p>
      )}
      <div className={styles.actions}>
        {entry.access === 'ACTIVE' ? (
          <ButtonLink href={learnHref(entry.course.id)} size="sm">
            {percent > 0 ? 'Continue learning' : 'Start learning'}
          </ButtonLink>
        ) : null}
        <Link href={`/courses/${entry.course.id}`} className={styles.detailsLink}>
          Course details
        </Link>
      </div>
    </article>
  );
}
