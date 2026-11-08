'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input, Select, Table, Textarea } from '@/components/ui';
import {
  grantEnrollment,
  listEnrollments,
  revokeEnrollment,
  type AdminEnrollment,
} from '@/lib/api/admin';
import { fieldErrors } from '@/lib/api/errors';
import type { EnrollmentStatus } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import {
  humanize,
  Loadable,
  MutationStatus,
  PageHeader,
  Pager,
  ReasonAction,
  Section,
  StatusBadge,
  useMutation,
} from '../kit';

const LIMIT = 50;

/** #49: every enrollment, filterable; admin grants (offline payment) and revokes, audited. */
export function EnrollmentsScreen() {
  const params = useSearchParams();
  const initial = {
    courseId: params.get('courseId') ?? '',
    studentId: params.get('studentId') ?? '',
    status: (params.get('status') ?? '') as EnrollmentStatus | '',
  };
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState({ ...initial, offset: 0 });
  const enrollments = useApi(`admin-enrollments:${JSON.stringify(query)}`, (signal) =>
    listEnrollments({ ...query, limit: LIMIT }, signal),
  );
  const mutation = useMutation();

  return (
    <>
      <PageHeader title="Enrollments" />
      <MutationStatus mutation={mutation} />
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ ...draft, offset: 0 });
        }}
      >
        <Input
          label="Course ID"
          value={draft.courseId}
          onChange={(e) => setDraft({ ...draft, courseId: e.target.value.trim() })}
        />
        <Input
          label="Student ID"
          value={draft.studentId}
          onChange={(e) => setDraft({ ...draft, studentId: e.target.value.trim() })}
        />
        <Select
          label="Status"
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as EnrollmentStatus | '' })}
        >
          <option value="">Any</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
        </Select>
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>
      <Loadable state={enrollments} what="enrollments">
        {(page) => (
          <>
            <Table<AdminEnrollment>
              caption={`${page.total} enrollment${page.total === 1 ? '' : 's'}`}
              rows={page.items}
              rowKey={(e) => e.id}
              empty="No enrollments match."
              columns={[
                {
                  key: 'student',
                  header: 'Student',
                  rowHeader: true,
                  cell: (e) => (
                    <Link href={`/admin/users/${e.student.id}`}>
                      {e.student.fullName || e.student.email}
                    </Link>
                  ),
                },
                {
                  key: 'course',
                  header: 'Course',
                  cell: (e) => <Link href={`/admin/courses/${e.course.id}`}>{e.course.title}</Link>,
                },
                { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
                {
                  key: 'source',
                  header: 'Source',
                  cell: (e) =>
                    `${humanize(e.source)}${e.paymentChannel ? ` (${e.paymentChannel})` : ''}`,
                },
                { key: 'granted', header: 'Granted', cell: (e) => formatDate(e.grantedAt) },
                {
                  key: 'expires',
                  header: 'Access until',
                  cell: (e) => (e.expiresAt ? formatDate(e.expiresAt) : 'No end date'),
                },
                {
                  key: 'progress',
                  header: 'Progress',
                  numeric: true,
                  cell: (e) => `${Math.round(e.completionPercent ?? 0)}%`,
                },
                {
                  key: 'actions',
                  header: 'Action',
                  cell: (e) =>
                    e.status === 'ACTIVE' ? (
                      <ReasonAction
                        label="Revoke"
                        variant="danger"
                        onConfirm={async (reason) => {
                          const ok = await mutation.run(
                            () => revokeEnrollment(e.id, reason),
                            `Access to ${e.course.title} revoked.`,
                          );
                          if (ok) enrollments.reload();
                          return ok;
                        }}
                      />
                    ) : null,
                },
              ]}
            />
            <Pager
              total={page.total}
              limit={LIMIT}
              offset={query.offset}
              onChange={(offset) => setQuery({ ...query, offset })}
            />
          </>
        )}
      </Loadable>
      <GrantForm onGranted={enrollments.reload} initialCourseId={initial.courseId} />
    </>
  );
}

/** #49: an admin grant records the offline payment channel and the reason. */
function GrantForm({
  onGranted,
  initialCourseId,
}: {
  onGranted: () => void;
  initialCourseId: string;
}) {
  const [studentEmail, setStudentEmail] = useState('');
  const [courseId, setCourseId] = useState(initialCourseId);
  const [paymentChannel, setPaymentChannel] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let failure: unknown;
    const ok = await mutation.run(
      () =>
        grantEnrollment({
          studentEmail: studentEmail.trim(),
          courseId: courseId.trim(),
          paymentChannel: paymentChannel.trim(),
          reason: reason.trim(),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
        }).catch((e) => {
          failure = e;
          throw e;
        }),
      `Access granted to ${studentEmail.trim()}.`,
    );
    setErrors(ok ? {} : fieldErrors(failure));
    if (ok) {
      setStudentEmail('');
      setReason('');
      onGranted();
    }
  }

  return (
    <Section title="Grant access">
      <form className={styles.form} onSubmit={submit}>
        <Input
          label="Student email"
          type="email"
          required
          value={studentEmail}
          error={errors.studentEmail}
          onChange={(e) => setStudentEmail(e.target.value)}
        />
        <Input
          label="Course ID"
          required
          value={courseId}
          error={errors.courseId}
          onChange={(e) => setCourseId(e.target.value)}
        />
        <Input
          label="Payment channel"
          hint="How the student paid, e.g. cash at centre, bank transfer outside the platform."
          required
          value={paymentChannel}
          error={errors.paymentChannel}
          onChange={(e) => setPaymentChannel(e.target.value)}
        />
        <Textarea
          label="Reason"
          required
          rows={2}
          value={reason}
          error={errors.reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Input
          label="Access until (optional)"
          type="date"
          value={expiresAt}
          error={errors.expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Grant access
          </Button>
        </div>
      </form>
    </Section>
  );
}
