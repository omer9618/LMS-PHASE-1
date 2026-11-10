'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Alert, Badge, Button, ButtonLink } from '@/components/ui';
import { adminAccess, canSwitchContext } from '@/lib/admin/access';
import {
  getDashboard,
  switchContext,
  type AdminDashboard,
  type MeWithContext,
} from '@/lib/api/admin';
import { errorMessage } from '@/lib/api/errors';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import styles from './AdminShell.module.css';

type QueueKey = keyof AdminDashboard['queues'];

export interface AdminNavItem {
  href: string;
  label: string;
  /** The dashboard queue whose count is shown next to the link (#102). */
  queue?: QueueKey;
}

export const ADMIN_NAV: Array<{ group: string; items: AdminNavItem[] }> = [
  { group: 'Overview', items: [{ href: '/admin', label: 'Dashboard' }] },
  {
    group: 'Queues',
    items: [
      {
        href: '/admin/verification',
        label: 'Payment verification',
        queue: 'paymentVerificationsPending',
      },
      { href: '/admin/courses', label: 'Course review', queue: 'coursesPendingApproval' },
      {
        href: '/admin/applications',
        label: 'Teacher applications',
        queue: 'teacherApplicationsOpen',
      },
      { href: '/admin/concerns', label: 'Payout concerns', queue: 'payoutConcerns' },
    ],
  },
  {
    group: 'Manage',
    items: [
      { href: '/admin/users', label: 'Users and teachers' },
      { href: '/admin/enrollments', label: 'Enrollments' },
      { href: '/admin/orders', label: 'Orders' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { href: '/admin/finance', label: 'Financial summary' },
      { href: '/admin/payouts', label: 'Payout run' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { href: '/admin/settings', label: 'Settings' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

/** Is `href` the current section? `/admin` only matches itself. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin area (#102): compact density, navigation with live queue counts, the labelled
 * Admin/Teacher context switch for dual-role accounts (#109), and the access gate.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const user = session.user as MeWithContext | null;
  const access = adminAccess(session.status, user);
  const pathname = usePathname() ?? '/admin';
  const dashboard = useApi(access === 'ok' ? `admin-nav:${pathname}` : null, (signal) =>
    getDashboard(signal),
  );
  const counts = dashboard.status === 'success' ? dashboard.data.queues : null;

  return (
    <div className={styles.ground}>
      <div className={styles.shell} data-density="compact">
        {access === 'ok' ? (
          <>
            <aside className={styles.sidebar}>
              <ContextBar user={user} />
              <nav aria-label="Admin">
                {ADMIN_NAV.map((group) => (
                  <div key={group.group} className={styles.group}>
                    <p className={styles.groupLabel}>{group.group}</p>
                    <ul className={styles.navList}>
                      {group.items.map((item) => {
                        const count = item.queue && counts ? counts[item.queue] : null;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={styles.navLink}
                              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                            >
                              <span>{item.label}</span>
                              {typeof count === 'number' && count > 0 && (
                                <Badge tone="highlight" aria-label={`${count} waiting`}>
                                  {count}
                                </Badge>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </aside>
            <div className={styles.content}>{children}</div>
          </>
        ) : (
          <div className={styles.gate}>
            <Gate access={access} user={user} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows the active context and, for Admin+Teacher accounts, the explicit switch (#109). */
function ContextBar({ user }: { user: MeWithContext | null }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canSwitchContext(user)) {
    return (
      <p className={styles.context}>
        <Badge tone="primary">Admin</Badge>
      </p>
    );
  }
  return (
    <div className={styles.context}>
      <p>
        Working as <Badge tone="primary">Admin</Badge>
      </p>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await switchContext('TEACHER');
            await refresh();
            router.push('/teacher/courses');
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        Switch to Teacher
      </Button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function Gate({
  access,
  user,
}: {
  access: ReturnType<typeof adminAccess>;
  user: MeWithContext | null;
}) {
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  switch (access) {
    case 'loading':
      return <p role="status">Loading…</p>;
    case 'signed-out':
      return (
        <Alert tone="info" title="Sign in to continue">
          <p>The admin area is for staff accounts.</p>
          <ButtonLink href="/login?next=/admin" size="sm">
            Sign in
          </ButtonLink>
        </Alert>
      );
    case 'not-admin':
      return (
        <Alert tone="warning" title="Admins only">
          <p>Your account does not have the Admin role.</p>
        </Alert>
      );
    case 'mfa-setup':
      return (
        <Alert tone="warning" title="Two-step verification required">
          <p>Admin accounts must set up two-step verification before using the admin area.</p>
          <ButtonLink href="/account/mfa" size="sm">
            Set it up now
          </ButtonLink>
        </Alert>
      );
    case 'mfa-signin':
      return (
        <Alert tone="warning" title="Sign in again with your code">
          <p>This session has not passed two-step verification.</p>
          <ButtonLink href="/login?next=/admin" size="sm">
            Sign in again
          </ButtonLink>
        </Alert>
      );
    case 'wrong-context':
      return (
        <Alert tone="warning" title="You are working as Teacher">
          <p>
            {user?.fullName ?? 'This account'} holds both the Admin and Teacher roles. The admin
            area needs the Admin context; switching is never automatic.
          </p>
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await switchContext('ADMIN');
                await refresh();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Switch to Admin
          </Button>
          {error && <p>{error}</p>}
        </Alert>
      );
    case 'ok':
      return null;
  }
}
