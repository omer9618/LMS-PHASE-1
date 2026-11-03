import Link from 'next/link';
import { AccountMenu } from './AccountMenu';
import { MfaBanner } from './MfaBanner';
import { RoleNav } from './RoleNav';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          LMS
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <Link href="/courses">Courses</Link>
          <RoleNav />
        </nav>
        <AccountMenu />
      </div>
      <MfaBanner />
      <VerifyEmailBanner />
    </header>
  );
}
