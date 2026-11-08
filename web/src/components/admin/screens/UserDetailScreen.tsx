'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, ButtonLink, Select, Table } from '@/components/ui';
import {
  deactivateTeacher,
  getUserOverview,
  grantRole,
  reactivateUser,
  revokeRole,
  sendPasswordReset,
  suspendUser,
  type AdminCourse,
  type AdminEnrollment,
} from '@/lib/api/admin';
import type { Role } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import {
  Facts,
  formatDateTime,
  humanize,
  Loadable,
  MutationStatus,
  PageHeader,
  ReasonAction,
  Section,
  StatusBadge,
  useMutation,
} from '../kit';

const ROLES: Role[] = ['STUDENT', 'TEACHER', 'ADMIN'];

/** #103: one account with its enrollments, courses taught and every account action. */
export function UserDetailScreen({ userId }: { userId: string }) {
  const overview = useApi(`admin-user:${userId}`, (signal) => getUserOverview(userId, signal));
  const mutation = useMutation();
  const [role, setRole] = useState<Role>('TEACHER');

  const act = async (action: () => Promise<unknown>, success: string) => {
    const ok = await mutation.run(action, success);
    if (ok) overview.reload();
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
                      act(() => suspendUser(user.id, reason), 'Account suspended.')
                    }
                  />
                ) : user.status === 'SUSPENDED' ? (
                  <ReasonAction
                    label="Reactivate"
                    onConfirm={(reason) =>
                      act(() => reactivateUser(user.id, reason), 'Account reactivated.')
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
                        () => sendPasswordReset(user.id),
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
                      act(() => deactivateTeacher(user.id, reason), 'Teacher deactivated.')
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
                        act(() => revokeRole(user.id, r), `${humanize(r)} role removed.`)
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
                        () => grantRole(user.id, chosen),
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
