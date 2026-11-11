'use client';

import Link from 'next/link';
import {
  Badge,
  ButtonLink,
  Loadable,
  PageHeader,
  StatGrid,
  StatTile,
  type BadgeTone,
} from '@/components/ui';
import { enrollmentApi } from '@/lib/api/enrollment';
import type { AccessState, DashboardEntry } from '@/lib/api/schemas/enrollment';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
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
  const enrollments = useQuery({
    queryKey: ['enrollments', user?.id],
    queryFn: ({ signal }) => enrollmentApi.mine(signal),
    enabled: user !== null,
  });

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
      <PageHeader
        eyebrow="Your courses"
        title="My learning"
        description="Pick up where you left off. A course shows as complete when every lesson is done."
        actions={
          <ButtonLink href="/courses" variant="secondary" size="sm">
            Find more courses
          </ButtonLink>
        }
      />
      <Loadable state={enrollments} what="your courses">
        {(entries) => {
          if (entries.length === 0) {
            return (
              <div className={styles.empty}>
                <p>You are not enrolled in any course yet.</p>
                <ButtonLink href="/courses">Browse courses</ButtonLink>
              </div>
            );
          }
          const summary = summarise(entries);
          return (
            <>
              <StatGrid label="Your progress">
                <StatTile label="Active courses" value={summary.active} />
                <StatTile label="Completed" value={summary.completed} />
                <StatTile
                  label="Lessons done"
                  value={`${summary.lessonsDone} / ${summary.lessonsTotal}`}
                />
              </StatGrid>
              <ul className={styles.list}>
                {sortEntries(entries).map((entry) => (
                  <li key={entry.id}>
                    <EnrollmentCard entry={entry} />
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </Loadable>
    </div>
  );
}

/** Counts for the tiles above the cards. Only courses with access count as active. */
export function summarise(entries: DashboardEntry[]) {
  const active = entries.filter((e) => e.access === 'ACTIVE');
  return {
    active: active.length,
    completed: active.filter((e) => Math.round(e.completionPercent ?? 0) >= 100).length,
    lessonsDone: active.reduce((sum, e) => sum + (e.completedLessons ?? 0), 0),
    lessonsTotal: active.reduce((sum, e) => sum + (e.totalLessons ?? 0), 0),
  };
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
      <p className="hint">
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
              ({entry.completedLessons ?? 0} of {entry.totalLessons} lesson
              {entry.totalLessons === 1 ? '' : 's'})
            </span>
          )}
        </span>
      </div>
      {entry.expiresAt && (
        <p className="hint">
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
