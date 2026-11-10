'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  ButtonLink,
  Loadable,
  PageHeader,
  Section,
  Select,
  StatGrid,
  StatTile,
  Table,
  type Column,
} from '@/components/ui';
import { teacherApi } from '@/lib/api/teacher';
import type { CourseStatus, TeacherCourse } from '@/lib/api/types';
import { COURSE_STATUS } from '@/lib/course-status';
import { formatDate } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { useApi } from '@/lib/use-api';
import styles from './Teacher.module.css';

const STATUSES = Object.keys(COURSE_STATUS) as CourseStatus[];

/** What the teacher does next with a course in each status, and where. */
export function nextStep(course: TeacherCourse): { label: string; href: string } {
  const base = `/teacher/courses/${course.id}`;
  switch (course.status) {
    case 'DRAFT':
      return { label: 'Finish and submit', href: base };
    case 'REJECTED':
      return { label: 'See what to fix', href: base };
    case 'PENDING_APPROVAL':
      return { label: 'View submission', href: base };
    case 'PUBLISHED':
      return { label: 'Edit content', href: `${base}/content` };
    case 'ARCHIVED':
      return { label: 'View', href: base };
  }
}

const COLUMNS: Array<Column<TeacherCourse>> = [
  {
    key: 'title',
    header: 'Course',
    rowHeader: true,
    cell: (c) => (
      <span className={styles.courseCell}>
        <Link href={`/teacher/courses/${c.id}`}>{c.title}</Link>
        <span className={styles.courseMeta}>
          {c.board.name} · {c.level.name} · {c.subject.name}
        </span>
        {c.status === 'REJECTED' && c.rejectionReason && (
          <span className={styles.courseReason}>Reason: {c.rejectionReason}</span>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (c) => <Badge tone={COURSE_STATUS[c.status].tone}>{COURSE_STATUS[c.status].label}</Badge>,
  },
  {
    key: 'price',
    header: 'Price',
    numeric: true,
    cell: (c) => (c.isFree || c.priceMinor ? formatPrice(c) : '—'),
  },
  {
    key: 'enrollment',
    header: 'Enrolment',
    cell: (c) =>
      c.status === 'PUBLISHED' ? (c.isEnrollmentOpen ? 'Open' : 'Closed to new students') : '—',
  },
  { key: 'created', header: 'Created', cell: (c) => formatDate(c.createdAt) },
  {
    key: 'next',
    header: 'Next step',
    cell: (c) => {
      const step = nextStep(c);
      return <Link href={step.href}>{step.label}</Link>;
    },
  },
];

const count = (courses: TeacherCourse[], status: CourseStatus) =>
  courses.filter((c) => c.status === status).length;

/** #24/#26: the teacher's own courses, with what each one needs next. */
export function MyCourses() {
  const [status, setStatus] = useState<CourseStatus | ''>('');
  // One request for every course: the tiles count all of them, the filter narrows the table.
  const courses = useApi('my-courses', (signal) => teacherApi.listCourses(undefined, signal));
  const total = courses.status === 'success' ? courses.data.length : null;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={total === null ? 'Your courses' : `${total} ${total === 1 ? 'course' : 'courses'}`}
        title="My courses"
        description="Details lock once a course is submitted. An admin sets the price and commission at approval."
        actions={<ButtonLink href="/teacher/courses/new">New course</ButtonLink>}
      />
      <Loadable state={courses} what="your courses">
        {(all) => {
          const rejected = count(all, 'REJECTED');
          const rows = status ? all.filter((c) => c.status === status) : all;
          return (
            <>
              <StatGrid label="Courses by status">
                <StatTile label="Published" value={count(all, 'PUBLISHED')} />
                <StatTile label="In review" value={count(all, 'PENDING_APPROVAL')} />
                <StatTile label="Drafts" value={count(all, 'DRAFT')} />
                <StatTile
                  label="Sent back"
                  value={rejected}
                  tone={rejected > 0 ? 'danger' : 'neutral'}
                />
              </StatGrid>
              <Section
                flush
                aria-label="Courses"
                title="Courses"
                actions={
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
                }
              >
                <Table
                  caption="My courses"
                  hideCaption
                  columns={COLUMNS}
                  rows={rows}
                  rowKey={(c) => c.id}
                  empty={
                    status
                      ? 'No courses with this status.'
                      : 'No courses yet. Create your first course.'
                  }
                />
              </Section>
            </>
          );
        }}
      </Loadable>
    </div>
  );
}
