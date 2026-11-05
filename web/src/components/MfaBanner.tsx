'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { needsMfaSetup, useSession } from '@/lib/session';
import styles from './SiteHeader.module.css';

/** Admins without MFA are blocked by the API (403 MFA_REQUIRED) until they enrol (#16). */
export function MfaBanner() {
  const { user } = useSession();
  const pathname = usePathname();
  if (!needsMfaSetup(user) || pathname === '/account/mfa') return null;
  return (
    <div className={styles.banner} role="region" aria-label="Two-step verification required">
      <div className={styles.bannerInner}>
        <p>Admin accounts must use two-step verification before they can do anything else.</p>
        <Link href="/account/mfa">Set it up now</Link>
      </div>
    </div>
  );
}
