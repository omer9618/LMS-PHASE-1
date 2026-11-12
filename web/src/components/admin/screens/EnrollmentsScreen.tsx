'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Input,
  Loadable,
  PageHeader,
  Pager,
  Section,
  Select,
  StatusBadge,
  Table,
  Textarea,
} from '@/components/ui';
import { adminApi, type AdminEnrollment } from '@/lib/api/admin';
import { fieldErrors } from '@/lib/api/errors';
import type { EnrollmentStatus } from '@/lib/api/schemas/enrollment';
import { formatDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import styles from '../Admin.module.css';
import { MutationStatus, ReasonAction } from '@/components/ui';
import { useMutation } from '@/lib/use-mutation';
import { humanize } from '@/lib/format';
import { grantForm } from '@/lib/forms/admin';
import { useZodForm } from '@/lib/forms/use-zod-form';

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
  const enrollments = useQuery({
    queryKey: ['admin-enrollments', query],
    queryFn: ({ signal }) => adminApi.listEnrollments({ ...query, limit: LIMIT }, signal),
  });
  const mutation = useMutation();

  return (
    <>
      <PageHeader
        eyebrow="Access to courses · newest first"
        title="Enrolments"
        description="Who can open which course, and how they got access."
      />
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
      <Loadable state={enrollments} what="enrolments">
        {(page) => (
          <>
            <Table<AdminEnrollment>
              caption={`${page.total} enrollment${page.total === 1 ? '' : 's'}`}
              rows={page.items}
              rowKey={(e) => e.id}
              empty="No enrolments match."
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
                            () => adminApi.revokeEnrollment(e.id, reason),
                            `Access to ${e.course.title} revoked.`,
                          );
                          if (ok) void enrollments.refetch();
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
      <GrantForm onGranted={() => void enrollments.refetch()} initialCourseId={initial.courseId} />
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
  const form = useZodForm(grantForm, {
    studentEmail: '',
    courseId: initialCourseId,
    paymentChannel: '',
    reason: '',
    expiresAt: '',
  });
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = form.check();
    if (!body) return;
    const ok = await mutation.run(
      () =>
        adminApi.grantEnrollment({
          ...body,
          expiresAt: body.expiresAt
            ? new Date(`${body.expiresAt}T23:59:59`).toISOString()
            : undefined,
        }),
      `Access granted to ${body.studentEmail}.`,
      (error) => form.setErrors(fieldErrors(error)),
    );
    if (ok) {
      form.setValues({ ...form.values, studentEmail: '', reason: '' });
      onGranted();
    }
  }

  return (
    <Section title="Grant access">
      <form className={styles.form} onSubmit={submit} noValidate>
        <Input label="Student email" type="email" required {...form.bind('studentEmail')} />
        <Input label="Course ID" required {...form.bind('courseId')} />
        <Input
          label="Payment channel"
          hint="How the student paid, e.g. cash at centre, bank transfer outside the platform."
          required
          {...form.bind('paymentChannel')}
        />
        <Textarea label="Reason" required rows={2} {...form.bind('reason')} />
        <Input label="Access until (optional)" type="date" {...form.bind('expiresAt')} />
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
