'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, ButtonLink } from '@/components/ui';
import type { Role } from '@/lib/api/types';
import { displayName, useSession } from '@/lib/session';
import styles from './SiteHeader.module.css';

const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  ADMIN: 'Admin',
};

/** The right side of the header: who is signed in, with sign-out; or sign-in links. */
export function AccountMenu() {
  const { status, user, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (status === 'loading') return <div className={styles.account} aria-hidden="true" />;

  if (!user) {
    const next =
      pathname && !pathname.startsWith('/login') ? `?next=${encodeURIComponent(pathname)}` : '';
    return (
      <div className={styles.account}>
        <Link href={`/login${next}`}>Sign in</Link>
        <ButtonLink href={`/register${next}`} size="sm">
          Create account
        </ButtonLink>
      </div>
    );
  }

  const staffRoles = user.roles.filter((role) => role !== 'STUDENT');

  return (
    <div className={styles.account}>
      <span className={styles.userName}>
        <span className="visually-hidden">Signed in as </span>
        {displayName(user)}
      </span>
      {staffRoles.map((role) => (
        <Badge key={role} tone="primary">
          {ROLE_LABELS[role]}
        </Badge>
      ))}
      <Button
        variant="secondary"
        size="sm"
        loading={signingOut}
        loadingText="Signing out…"
        onClick={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
            router.push('/courses');
            router.refresh();
          }
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
