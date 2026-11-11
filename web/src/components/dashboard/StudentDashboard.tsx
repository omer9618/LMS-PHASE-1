'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Loadable,
  PageHeader,
  ProgressBar,
  Select,
  SignInGate,
  StatGrid,
  StatTile,
  type BadgeTone,
  Skeleton,
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

export type DashboardSort = 'recent' | 'progress' | 'title';
export type DashboardFilter = 'all' | 'in-progress' | 'not-started' | 'completed' | 'ended';

export const SORT_LABELS: Record<DashboardSort, string> = {
  progress: 'Continue first',
  recent: 'Recently enrolled',
  title: 'Title (A–Z)',
};

export const FILTER_LABELS: Record<DashboardFilter, string> = {
  all: 'All courses',
  'in-progress': 'In progress',
  'not-started': 'Not started',
  completed: 'Completed',
  ended: 'Expired or removed',
};

/** How many course cards show before "Show more", so a long list stays easy to scan. */
export const PAGE_SIZE = 12;

const percentOf = (entry: DashboardEntry) => Math.round(entry.completionPercent ?? 0);

function matchesFilter(entry: DashboardEntry, filter: DashboardFilter): boolean {
  const active = entry.access === 'ACTIVE';
  switch (filter) {
    case 'all':
      return true;
    case 'ended':
      return !active;
    case 'completed':
      return active && percentOf(entry) >= 100;
    case 'in-progress':
      return active && percentOf(entry) > 0 && percentOf(entry) < 100;
    case 'not-started':
      return active && percentOf(entry) === 0;
  }
}

export function filterEntries(
  entries: DashboardEntry[],
  filter: DashboardFilter,
): DashboardEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filter));
}

/**
 * The cards in the order asked for. "Continue first" puts courses under way ahead of ones not
 * started, then finished ones and ended access, with the furthest along first, so the course to
 * pick up is at the top.
 */
export function orderEntries(entries: DashboardEntry[], sort: DashboardSort): DashboardEntry[] {
  if (sort === 'title') {
    return [...entries].sort((a, b) => a.course.title.localeCompare(b.course.title));
  }
  if (sort === 'progress') {
    const rank = (entry: DashboardEntry) => {
      if (entry.access !== 'ACTIVE') return 3;
      const percent = percentOf(entry);
      return percent >= 100 ? 2 : percent > 0 ? 0 : 1;
    };
    return sortEntries(entries).sort(
      (a, b) => rank(a) - rank(b) || (rank(a) === 0 ? percentOf(b) - percentOf(a) : 0),
    );
  }
  return sortEntries(entries);
}

/** #52: the student's courses with completion. */
export function StudentDashboard() {
  const { status, user } = useSession();
  const [sort, setSort] = useState<DashboardSort>('progress');
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);
  const enrollments = useQuery({
    queryKey: ['enrollments', user?.id],
    queryFn: ({ signal }) => enrollmentApi.mine(signal),
    enabled: user !== null,
  });

  if (status === 'loading') return <Skeleton label="Loading…" />;
  if (!user) {
    return <SignInGate next="/dashboard">Sign in to see your courses.</SignInGate>;
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
          const visible = orderEntries(filterEntries(entries, filter), sort);
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
              {entries.length > 1 && (
                <div className={styles.controls}>
                  <Select
                    label="Show"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value as DashboardFilter);
                      setShown(PAGE_SIZE);
                    }}
                  >
                    {Object.entries(FILTER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Sort by"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as DashboardSort)}
                  >
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {visible.length === 0 ? (
                <p className="muted">No courses match this filter.</p>
              ) : (
                <ul className={styles.list}>
                  {visible.slice(0, shown).map((entry) => (
                    <li key={entry.id}>
                      <EnrollmentCard entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
              {visible.length > shown && (
                <div>
                  <Button variant="secondary" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, visible.length - shown)} more
                  </Button>
                </div>
              )}
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
        {/* "Active" is the normal state and says nothing; only a problem gets a chip. */}
        {entry.access !== 'ACTIVE' && <Badge tone={access.tone}>{access.label}</Badge>}
      </div>
      {entry.course.teacher?.fullName && <p className="hint">{entry.course.teacher.fullName}</p>}
      <div className={styles.progressRow}>
        <ProgressBar value={percent} label={`${entry.course.title}: ${percent}% complete`} />
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
