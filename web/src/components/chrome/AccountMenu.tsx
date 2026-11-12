'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, ButtonLink } from '@/components/ui/index';
import type { Role } from '@/lib/api/schemas/auth';
import { displayName, useSession } from '@/lib/session';
import styles from './SiteHeader.module.css';

const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  ADMIN: 'Admin',
};

const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

/** The right side of the header: who is signed in, with sign-out; or sign-in links. */
export function AccountMenu() {
  const { status, user, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  if (status === 'loading') return <div className={styles.account} aria-hidden="true" />;

  if (!user) {
    // Come back here after signing in, unless "here" is itself a sign-in or sign-up page.
    const next =
      pathname && !AUTH_PAGES.some((page) => pathname.startsWith(page))
        ? `?next=${encodeURIComponent(pathname)}`
        : '';
    // On the sign-in page the "Sign in" link is where you already are, and on the sign-up page
    // "Create account" is: showing each one there only points at the page you are on.
    const onLogin = pathname?.startsWith('/login') ?? false;
    const onRegister = pathname?.startsWith('/register') ?? false;
    return (
      <div className={styles.account}>
        {!onLogin && (
          <ButtonLink href={`/login${next}`} size="sm" variant="ghost">
            Sign in
          </ButtonLink>
        )}
        {!onRegister && (
          <ButtonLink href={`/register${next}`} size="sm">
            Create account
          </ButtonLink>
        )}
      </div>
    );
  }

  const staffRoles = user.roles.filter((role) => role !== 'STUDENT');

  return (
    <div className={styles.account}>
      <Link
        href="/account"
        className={styles.userName}
        aria-label={`Your account, signed in as ${displayName(user)}`}
      >
        {displayName(user)}
      </Link>
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

/**
 * On a phone the account controls sit behind the Menu button, which would bury the one thing a
 * visitor came to do. This puts "Sign in" next to the button for a signed-out visitor, and
 * nothing for anyone else (the rest of the account controls stay in the menu).
 */
export function QuickSignIn() {
  const { status, user } = useSession();
  const pathname = usePathname();
  if (status === 'loading' || user || pathname?.startsWith('/login')) return null;
  const next =
    pathname && !AUTH_PAGES.some((page) => pathname.startsWith(page))
      ? `?next=${encodeURIComponent(pathname)}`
      : '';
  return (
    <ButtonLink href={`/login${next}`} size="sm" className={styles.quickSignIn}>
      Sign in
    </ButtonLink>
  );
}
