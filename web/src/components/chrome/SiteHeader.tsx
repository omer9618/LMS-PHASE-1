import Link from 'next/link';
import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';
import { HeaderMenu } from './HeaderMenu';
import { MfaBanner } from './MfaBanner';
import { PurchaseNav } from '../orders/PurchaseNav';
import { RoleNav } from './RoleNav';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <HeaderMenu brand={<BrandMark />}>
        <nav aria-label="Main" className={styles.nav}>
          <Link href="/courses">Courses</Link>
          <RoleNav />
          <PurchaseNav />
        </nav>
        <AccountMenu />
      </HeaderMenu>
      <MfaBanner />
      <VerifyEmailBanner />
    </header>
  );
}
