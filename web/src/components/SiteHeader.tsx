import Link from 'next/link';
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
        </nav>
      </div>
    </header>
  );
}
