'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Facts,
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
import {
  adminApi,
  type AdminUser,
  type ApplicationStatus,
  type TeacherApplication,
} from '@/lib/api/admin';
import { formatDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import styles from '../Admin.module.css';
import { ConfirmButton, MutationStatus, ReasonAction } from '@/components/ui';
import { useMutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';

const LIMIT = 50;

/** #20: the application review queue, oldest first. */
export function ApplicationsScreen() {
  const [status, setStatus] = useState<ApplicationStatus | ''>('SUBMITTED');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState({
    status: 'SUBMITTED' as ApplicationStatus | '',
    q: '',
    offset: 0,
  });
  const apps = useQuery({
    queryKey: ['admin-apps', query],
    queryFn: ({ signal }) => adminApi.listApplications({ ...query, limit: LIMIT }, signal),
  });
  return (
    <>
      <PageHeader
        eyebrow="Teacher intake · oldest first"
        title="Teacher applications"
        description="Read the CV, then move the application along or reject it with notes."
      />
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ status, q, offset: 0 });
        }}
      >
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ApplicationStatus | '')}
        >
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="HIRED">Hired</option>
          <option value="REJECTED">Rejected</option>
          <option value="">Any</option>
        </Select>
        <Input label="Name, email or subject" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" size="sm">
          Filter
        </Button>
      </form>
      <Loadable state={apps} what="applications">
        {(page) => (
          <>
            <Table<TeacherApplication>
              caption={`${page.total} application${page.total === 1 ? '' : 's'}`}
              rows={page.items}
              rowKey={(a) => a.id}
              empty="No applications here."
              columns={[
                {
                  key: 'name',
                  header: 'Applicant',
                  rowHeader: true,
                  cell: (a) => <Link href={`/admin/applications/${a.id}`}>{a.applicantName}</Link>,
                },
                { key: 'email', header: 'Email', cell: (a) => a.applicantEmail },
                { key: 'subjects', header: 'Subjects', cell: (a) => a.subjects ?? '—' },
                { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
                { key: 'created', header: 'Received', cell: (a) => formatDate(a.createdAt) },
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
    </>
  );
}

/** #20, #21: one application: CV, decision, and the teacher account it leads to. */
export function ApplicationDetailScreen({ applicationId }: { applicationId: string }) {
  const app = useQuery({
    queryKey: ['admin-app', applicationId],
    queryFn: ({ signal }) => adminApi.getApplication(applicationId, signal),
  });
  const mutation = useMutation();
  const [notes, setNotes] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const act = async (action: () => Promise<unknown>, success: string) => {
    const ok = await mutation.run(action, success);
    if (ok) void app.refetch();
    return ok;
  };

  return (
    <Loadable state={app} what="the application">
      {(a) => {
        const open = a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW';
        const review =
          (to: 'UNDER_REVIEW' | 'REJECTED' | 'HIRED', success: string) => (e?: FormEvent) => {
            e?.preventDefault();
            void act(
              () =>
                adminApi.reviewApplication(a.id, { status: to, notes: notes.trim() || undefined }),
              success,
            );
          };
        return (
          <>
            <PageHeader
              eyebrow="Teacher application"
              title={a.applicantName}
              description={a.applicantEmail}
              actions={<StatusBadge status={a.status} />}
            />
            <MutationStatus mutation={mutation} />
            <Section
              title="Application"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  loading={mutation.pending}
                  onClick={() => {
                    // Open the tab now (a click, so it is not blocked) and point it at the
                    // short-lived link once the API has made it.
                    const tab = window.open('', '_blank');
                    void mutation
                      .run(async () => {
                        const { url } = await adminApi.getApplicationCv(a.id);
                        if (tab) tab.location.href = url;
                        else window.location.assign(url);
                      })
                      .then((ok) => {
                        if (!ok) tab?.close();
                      });
                  }}
                >
                  Download CV
                </Button>
              }
            >
              <Facts
                items={[
                  ['Phone', a.applicantPhone],
                  ['Subjects', a.subjects],
                  ['Received', formatDateTime(a.createdAt)],
                  [
                    'Reviewed',
                    a.reviewedAt
                      ? `${formatDateTime(a.reviewedAt)} by ${a.reviewedBy?.fullName ?? a.reviewedBy?.email ?? 'an admin'}`
                      : null,
                  ],
                  ['Notes', a.reviewNotes],
                  ['Purge after', a.purgeAfter ? formatDate(a.purgeAfter) : null],
                  [
                    'Account',
                    a.user ? <Link href={`/admin/users/${a.user.id}`}>{a.user.email}</Link> : null,
                  ],
                ]}
              />
            </Section>
            {open && (
              <Section title="Decision">
                <form
                  className={styles.form}
                  onSubmit={review('UNDER_REVIEW', 'Marked under review.')}
                >
                  <Textarea
                    label="Notes (kept with the application)"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className={styles.actions}>
                    {a.status === 'SUBMITTED' && (
                      <Button type="submit" size="sm" variant="secondary">
                        Mark under review
                      </Button>
                    )}
                    <ConfirmButton
                      variant="primary"
                      question={`Hire ${a.applicantName}?`}
                      confirmLabel="Hire"
                      onConfirm={async () => {
                        await act(
                          () =>
                            adminApi.reviewApplication(a.id, {
                              status: 'HIRED',
                              notes: notes.trim() || undefined,
                            }),
                          'Applicant hired.',
                        );
                      }}
                    >
                      Hire
                    </ConfirmButton>
                    <ReasonAction
                      label="Reject"
                      variant="danger"
                      reasonLabel="Reason (kept with the application)"
                      hint="Saved as the review notes. Rejecting is final."
                      onConfirm={(reason) =>
                        act(
                          () =>
                            adminApi.reviewApplication(a.id, { status: 'REJECTED', notes: reason }),
                          'Application rejected.',
                        )
                      }
                    />
                  </div>
                </form>
              </Section>
            )}
            {a.status !== 'REJECTED' && !a.user && (
              <Section title="Teacher account">
                <p className="muted">
                  Hiring needs a teacher account. Create one from this application (the applicant
                  gets a link to set a password), or link an account that already exists.
                </p>
                <div className={styles.actions}>
                  <ConfirmButton
                    variant="primary"
                    question={`Create an account for ${a.applicantEmail} and email them a link to set a password?`}
                    confirmLabel="Create account"
                    onConfirm={async () => {
                      await act(
                        () => adminApi.createAccountFromApplication(a.id),
                        `Teacher account created for ${a.applicantEmail}.`,
                      );
                    }}
                  >
                    Create teacher account
                  </ConfirmButton>
                </div>
                <form
                  className={styles.filters}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = linkEmail.trim().toLowerCase();
                    if (!email) {
                      setLinkError('Enter the email of the existing account.');
                      return;
                    }
                    setLinkError(null);
                    let found: AdminUser | undefined;
                    const looked = await mutation.run(async () => {
                      const page = await adminApi.listUsers({ q: email, limit: 5 });
                      found = page.items.find((u) => u.email.toLowerCase() === email);
                    });
                    if (!looked) return;
                    if (!found) {
                      setLinkError('No account uses that email.');
                      return;
                    }
                    const user = found;
                    await act(() => adminApi.linkApplication(a.id, user.id), 'Account linked.');
                  }}
                  noValidate
                >
                  <Input
                    label="Or link an existing account by email"
                    type="email"
                    autoComplete="off"
                    value={linkEmail}
                    error={linkError}
                    onChange={(e) => setLinkEmail(e.target.value)}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Link account
                  </Button>
                </form>
              </Section>
            )}
          </>
        );
      }}
    </Loadable>
  );
}
