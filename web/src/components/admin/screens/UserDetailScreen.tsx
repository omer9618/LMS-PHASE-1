'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Facts,
  Loadable,
  PageHeader,
  Section,
  Select,
  StatusBadge,
  Table,
} from '@/components/ui';
import { adminApi, type AdminCourse, type AdminEnrollment } from '@/lib/api/admin';
import type { Role } from '@/lib/api/schemas/auth';
import { formatDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import styles from '../Admin.module.css';
import { MutationStatus, ReasonAction } from '@/components/ui';
import { useMutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';
import { humanize } from '@/lib/format';

const ROLES: Role[] = ['STUDENT', 'TEACHER', 'ADMIN'];

/** #103: one account with its enrollments, courses taught and every account action. */
export function UserDetailScreen({ userId }: { userId: string }) {
  const overview = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: ({ signal }) => adminApi.getUserOverview(userId, signal),
  });
  const mutation = useMutation();
  const [role, setRole] = useState<Role>('TEACHER');

  const act = async (action: () => Promise<unknown>, success: string) => {
    const ok = await mutation.run(action, success);
    if (ok) void overview.refetch();
    return ok;
  };

  return (
    <Loadable state={overview} what="the account">
      {({ user, enrollments, coursesTaught }) => {
        const isTeacher = user.roles.includes('TEACHER');
        const missingRoles = ROLES.filter((r) => !user.roles.includes(r));
        return (
          <>
            <PageHeader
              eyebrow="Account"
              title={user.fullName || user.email}
              description={user.email}
              actions={<StatusBadge status={user.status} />}
            />
            <MutationStatus mutation={mutation} />
            <Section title="Account">
              <Facts
                items={[
                  ['Roles', user.roles.map((r) => humanize(r)).join(', ')],
                  ['Email verified', user.isEmailVerified ? 'Yes' : 'No'],
                  ['Two-step verification', user.mfaEnabled ? 'On' : 'Off'],
                  ['Created', formatDateTime(user.createdAt)],
                  ['Last sign-in', formatDateTime(user.lastLoginAt) || 'Never'],
                  [
                    'Guardian',
                    [user.guardianName, user.guardianEmail, user.guardianPhone]
                      .filter(Boolean)
                      .join(' · '),
                  ],
                ]}
              />
              <div className={styles.actions}>
                {user.status === 'ACTIVE' ? (
                  <ReasonAction
                    label="Suspend"
                    variant="danger"
                    hint="Signs the user out everywhere. Teachers' courses stop taking enrollments."
                    onConfirm={(reason) =>
                      act(() => adminApi.suspendUser(user.id, reason), 'Account suspended.')
                    }
                  />
                ) : user.status === 'SUSPENDED' ? (
                  <ReasonAction
                    label="Reactivate"
                    onConfirm={(reason) =>
                      act(() => adminApi.reactivateUser(user.id, reason), 'Account reactivated.')
                    }
                  />
                ) : null}
                {user.status === 'ACTIVE' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={mutation.pending}
                    onClick={() =>
                      act(
                        () => adminApi.sendPasswordReset(user.id),
                        `A password reset link has been emailed to ${user.email}.`,
                      )
                    }
                  >
                    Send password reset
                  </Button>
                )}
                {isTeacher && user.status !== 'DELETED' && (
                  <ReasonAction
                    label="Deactivate teacher"
                    variant="danger"
                    hint="Permanent. Refused while students hold active enrollments in their courses."
                    onConfirm={(reason) =>
                      act(() => adminApi.deactivateTeacher(user.id, reason), 'Teacher deactivated.')
                    }
                  />
                )}
              </div>
            </Section>

            <Section title="Roles">
              <ul className={styles.actions} aria-label="Current roles">
                {user.roles.map((r) => (
                  <li key={r} className={styles.actions}>
                    <Badge tone="primary">{humanize(r)}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove the ${humanize(r)} role`}
                      onClick={() =>
                        act(() => adminApi.revokeRole(user.id, r), `${humanize(r)} role removed.`)
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              {missingRoles.length > 0 && (
                <div className={styles.filters}>
                  <Select
                    label="Grant a role"
                    value={missingRoles.includes(role) ? role : missingRoles[0]}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {missingRoles.map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => {
                      const chosen = missingRoles.includes(role) ? role : missingRoles[0]!;
                      void act(
                        () => adminApi.grantRole(user.id, chosen),
                        `${humanize(chosen)} role granted.`,
                      );
                    }}
                  >
                    Grant
                  </Button>
                </div>
              )}
            </Section>

            {isTeacher && (
              <Section
                title="Teacher"
                actions={
                  <>
                    <ButtonLink size="sm" variant="secondary" href={`/admin/teachers/${user.id}`}>
                      Statement and payouts
                    </ButtonLink>
                    <ButtonLink
                      size="sm"
                      variant="secondary"
                      href={`/admin/teachers/${user.id}/profile`}
                    >
                      Public profile
                    </ButtonLink>
                  </>
                }
              >
                <Table<AdminCourse>
                  caption={`Courses taught (${coursesTaught?.total ?? 0})`}
                  rows={coursesTaught?.items ?? []}
                  rowKey={(c) => c.id}
                  empty="No courses yet."
                  columns={[
                    {
                      key: 'title',
                      header: 'Course',
                      rowHeader: true,
                      cell: (c) => <Link href={`/admin/courses/${c.id}`}>{c.title}</Link>,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      cell: (c) => <StatusBadge status={c.status} />,
                    },
                    { key: 'created', header: 'Created', cell: (c) => formatDate(c.createdAt) },
                  ]}
                />
              </Section>
            )}

            <Section
              title="Enrollments as a student"
              actions={
                <ButtonLink
                  size="sm"
                  variant="secondary"
                  href={`/admin/enrollments?studentId=${user.id}`}
                >
                  All enrollments
                </ButtonLink>
              }
            >
              <Table<AdminEnrollment>
                caption={`${enrollments.total} enrollment${enrollments.total === 1 ? '' : 's'}`}
                hideCaption
                rows={enrollments.items}
                rowKey={(e) => e.id}
                empty="No enrollments."
                columns={[
                  {
                    key: 'course',
                    header: 'Course',
                    rowHeader: true,
                    cell: (e) => (
                      <Link href={`/admin/courses/${e.course.id}`}>{e.course.title}</Link>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (e) => <StatusBadge status={e.status} />,
                  },
                  { key: 'source', header: 'Source', cell: (e) => humanize(e.source) },
                  { key: 'granted', header: 'Granted', cell: (e) => formatDate(e.grantedAt) },
                  {
                    key: 'progress',
                    header: 'Progress',
                    numeric: true,
                    cell: (e) => `${Math.round(e.completionPercent ?? 0)}%`,
                  },
                ]}
              />
            </Section>
            <p className="muted">
              <Link href={`/admin/audit?entityId=${user.id}`}>Audit history for this account</Link>
            </p>
          </>
        );
      }}
    </Loadable>
  );
}
