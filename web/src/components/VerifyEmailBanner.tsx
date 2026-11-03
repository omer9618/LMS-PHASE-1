'use client';

import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { ResendVerificationButton } from './auth/ResendVerificationButton';
import styles from './SiteHeader.module.css';

/** Reminds a signed-in user with an unverified email to confirm it (#11). */
export function VerifyEmailBanner() {
  const { user } = useSession();
  const pathname = usePathname();
  if (!user || user.isEmailVerified || pathname === '/verify-email') return null;
  return (
    <div className={styles.banner} role="region" aria-label="Email verification">
      <div className={styles.bannerInner}>
        <p>
          Please confirm your email address: we sent a link to <strong>{user.email}</strong>.
        </p>
        <ResendVerificationButton size="sm" />
      </div>
    </div>
  );
}
