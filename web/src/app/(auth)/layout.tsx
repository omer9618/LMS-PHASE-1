import type { ReactNode } from 'react';
import styles from './auth.module.css';

/** Sign-in, registration and account-recovery screens share one narrow, centred column. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.card}>{children}</div>
    </div>
  );
}
