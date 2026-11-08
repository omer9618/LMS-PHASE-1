'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Checkbox, Input, Select, Table } from '@/components/ui';
import {
  createStaffAccount,
  listUsers,
  type AdminUser,
  type UserListQuery,
  type UserStatus,
} from '@/lib/api/admin';
import { fieldErrors } from '@/lib/api/errors';
import type { Role } from '@/lib/api/types';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import {
  formatDateTime,
  Loadable,
  MutationStatus,
  PageHeader,
  Pager,
  Section,
  StatusBadge,
  useMutation,
} from '../kit';

const LIMIT = 50;

/** #15, #103: every account, searchable by name or email, filterable by role and status. */
export function UsersScreen() {
  const [draft, setDraft] = useState<UserListQuery>({ role: '', status: '', q: '' });
  const [query, setQuery] = useState<UserListQuery>({ offset: 0 });
  const users = useApi(`admin-users:${JSON.stringify(query)}`, (signal) =>
    listUsers({ ...query, limit: LIMIT }, signal),
  );

  return (
    <>
      <PageHeader title="Users and teachers" description="Students, teachers and admins." />
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ ...draft, offset: 0 });
        }}
      >
        <Input
          label="Name or email"
          value={draft.q ?? ''}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
        />
        <Select
          label="Role"
          value={draft.role ?? ''}
          onChange={(e) => setDraft({ ...draft, role: e.target.value as Role | '' })}
        >
          <option value="">Any</option>
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
          <option value="ADMIN">Admin</option>
        </Select>
        <Select
          label="Status"
          value={draft.status ?? ''}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as UserStatus | '' })}
        >
          <option value="">Any</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DELETED">Deactivated</option>
        </Select>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <Loadable state={users} what="users">
        {(page) => (
          <>
            <Table<AdminUser>
              caption={`${page.total} account${page.total === 1 ? '' : 's'}`}
              rows={page.items}
              rowKey={(u) => u.id}
              empty="No account matches."
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  rowHeader: true,
                  cell: (u) => <Link href={`/admin/users/${u.id}`}>{u.fullName || u.email}</Link>,
                },
                { key: 'email', header: 'Email', cell: (u) => u.email },
                {
                  key: 'roles',
                  header: 'Roles',
                  cell: (u) => (
                    <span className={styles.actions}>
                      {u.roles.map((r) => (
                        <Badge key={r}>{r.toLowerCase()}</Badge>
                      ))}
                    </span>
                  ),
                },
                { key: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
                {
                  key: 'lastLogin',
                  header: 'Last sign-in',
                  cell: (u) => formatDateTime(u.lastLoginAt) || 'Never',
                },
              ]}
            />
            <Pager
              total={page.total}
              limit={LIMIT}
              offset={query.offset ?? 0}
              onChange={(offset) => setQuery({ ...query, offset })}
            />
          </>
        )}
      </Loadable>
      <CreateStaffAccount onCreated={users.reload} />
    </>
  );
}

/** #15: admins create staff accounts; the new user sets a password from the emailed link. */
function CreateStaffAccount({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [admin, setAdmin] = useState(false);
  const [teacher, setTeacher] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const roles = [admin && 'ADMIN', teacher && 'TEACHER'].filter(Boolean) as Array<
      'ADMIN' | 'TEACHER'
    >;
    if (roles.length === 0) {
      setErrors({ roles: 'Choose at least one role.' });
      return;
    }
    setErrors({});
    let failure: unknown;
    const ok = await mutation.run(
      () =>
        createStaffAccount({ email: email.trim(), fullName: fullName.trim(), roles }).catch((e) => {
          failure = e;
          throw e;
        }),
      `Account created. ${email.trim()} has been emailed a link to set a password.`,
    );
    if (ok) {
      setEmail('');
      setFullName('');
      onCreated();
    } else {
      setErrors(fieldErrors(failure));
    }
  }

  return (
    <Section title="Create a staff account">
      <form className={styles.form} onSubmit={submit}>
        <Input
          label="Email"
          type="email"
          required
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Full name"
          required
          value={fullName}
          error={errors.fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Checkbox
          label="Teacher"
          checked={teacher}
          onChange={(e) => setTeacher(e.target.checked)}
        />
        <Checkbox
          label="Admin"
          hint="Admins must set up two-step verification on first sign-in."
          checked={admin}
          error={errors.roles}
          onChange={(e) => setAdmin(e.target.checked)}
        />
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Create account
          </Button>
        </div>
      </form>
    </Section>
  );
}
