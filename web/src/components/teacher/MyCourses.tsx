'use client';

import Link from 'next/link';
import { Alert, Badge, Button, ButtonLink, Select, Table, type Column } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { teacherApi } from '@/lib/api/teacher';
import type { CourseStatus, TeacherCourse } from '@/lib/api/types';
import { COURSE_STATUS } from '@/lib/course-status';
import { formatDate } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import { useState } from 'react';
import styles from './Teacher.module.css';

const STATUSES = Object.keys(COURSE_STATUS) as CourseStatus[];

const COLUMNS: Array<Column<TeacherCourse>> = [
  {
    key: 'title',
    header: 'Course',
    rowHeader: true,
    cell: (c) => <Link href={`/teacher/courses/${c.id}`}>{c.title}</Link>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (c) => <Badge tone={COURSE_STATUS[c.status].tone}>{COURSE_STATUS[c.status].label}</Badge>,
  },
  {
    key: 'classification',
    header: 'Subject',
    cell: (c) => `${c.subject.name} · ${c.board.name} · ${c.level.name}`,
  },
  {
    key: 'price',
    header: 'Price',
    numeric: true,
    cell: (c) => (c.isFree || c.priceMinor ? formatPrice(c) : 'Not priced yet'),
  },
  { key: 'created', header: 'Created', cell: (c) => formatDate(c.createdAt) },
];

/** #24/#26: the teacher's own courses. */
export function MyCourses() {
  const [status, setStatus] = useState<CourseStatus | ''>('');
  const courses = useApi(`my-courses:${status}`, (signal) =>
    teacherApi.listCourses(status || undefined, signal),
  );

  return (
    <div className="stack">
      <div className={styles.titleRow}>
        <h1>My courses</h1>
        <ButtonLink href="/teacher/courses/new">New course</ButtonLink>
      </div>
      <Select
        label="Show"
        value={status}
        onChange={(e) => setStatus(e.target.value as CourseStatus | '')}
        className={styles.filter}
      >
        <option value="">All courses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {COURSE_STATUS[s].label}
          </option>
        ))}
      </Select>
      {courses.status === 'loading' && <p role="status">Loading your courses…</p>}
      {courses.status === 'error' && (
        <Alert tone="danger" title="Could not load your courses">
          <p>{errorMessage(courses.error)}</p>
          <Button size="sm" variant="secondary" onClick={courses.reload}>
            Try again
          </Button>
        </Alert>
      )}
      {courses.status === 'success' && (
        <Table
          caption="My courses"
          hideCaption
          columns={COLUMNS}
          rows={courses.data}
          rowKey={(c) => c.id}
          empty={
            status ? 'No courses with this status.' : 'No courses yet. Create your first course.'
          }
        />
      )}
    </div>
  );
}
