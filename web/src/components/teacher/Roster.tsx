'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Pager,
  Select,
  Table,
  type BadgeTone,
  type Column,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { EnrollmentSource, EnrollmentStatus } from '@/lib/api/schemas/enrollment';
import type { RosterEntry } from '@/lib/api/schemas/teacher';
import { formatDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { useCourseWorkspace } from './CourseWorkspace';
import styles from './Teacher.module.css';

export const ROSTER_PAGE_SIZE = 50;

const STATUS: Record<EnrollmentStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'warning' },
  REVOKED: { label: 'Revoked', tone: 'danger' },
};

const SOURCE: Record<EnrollmentSource, string> = {
  PURCHASE: 'Purchase',
  FREE: 'Free',
  ADMIN_GRANT: 'Granted by admin',
};

const COLUMNS: Array<Column<RosterEntry>> = [
  {
    key: 'student',
    header: 'Student',
    rowHeader: true,
    cell: (e) => (
      <>
        {e.student.fullName ?? '—'}
        <br />
        <span className="muted">{e.student.email}</span>
      </>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (e) => <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>,
  },
  { key: 'source', header: 'How', cell: (e) => SOURCE[e.source] ?? e.source },
  { key: 'granted', header: 'Since', cell: (e) => formatDate(e.grantedAt) },
  { key: 'expires', header: 'Until', cell: (e) => formatDate(e.expiresAt) || '—' },
  {
    key: 'progress',
    header: 'Progress',
    numeric: true,
    cell: (e) => (e.completionPercent === undefined ? '—' : `${e.completionPercent}%`),
  },
];

/** #50: the students in this course. View only (decided): changes are made by admins. */
export function Roster() {
  const { course } = useCourseWorkspace();
  const [status, setStatus] = useState<EnrollmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const roster = useQuery({
    queryKey: ['roster', course.id, status, page],
    queryFn: ({ signal }) =>
      teacherApi.roster(
        course.id,
        {
          limit: ROSTER_PAGE_SIZE,
          offset: (page - 1) * ROSTER_PAGE_SIZE,
          status: status || undefined,
        },
        signal,
      ),
  });
  return (
    <div className="stack">
      <p className="muted">View only. To grant or remove access, contact an administrator.</p>
      <Select
        label="Show"
        value={status}
        className={styles.filter}
        onChange={(e) => {
          setStatus(e.target.value as EnrollmentStatus | '');
          setPage(1);
        }}
      >
        <option value="">All students</option>
        {(Object.keys(STATUS) as EnrollmentStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS[s].label}
          </option>
        ))}
      </Select>
      {roster.status === 'pending' && <p role="status">Loading students…</p>}
      {roster.status === 'error' && (
        <Alert tone="danger" title="Could not load the students">
          <p>{errorMessage(roster.error)}</p>
          <Button size="sm" variant="secondary" onClick={() => void roster.refetch()}>
            Try again
          </Button>
        </Alert>
      )}
      {roster.status === 'success' && (
        <>
          <Table
            caption={`Students (${roster.data.total})`}
            columns={COLUMNS}
            rows={roster.data.items}
            rowKey={(e) => e.id}
            empty="No students yet."
          />
          <Pager
            total={roster.data.total}
            limit={ROSTER_PAGE_SIZE}
            offset={(page - 1) * ROSTER_PAGE_SIZE}
            onChange={(offset) => setPage(offset / ROSTER_PAGE_SIZE + 1)}
          />
        </>
      )}
    </div>
  );
}
