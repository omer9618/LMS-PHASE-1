import Link from 'next/link';
import { cx } from '@/components/ui/cx';
import styles from './Chrome.module.css';

/** The platform's name until the client supplies one (docs/UI_PLAN.md). */
export const PLATFORM_NAME = 'LMS';

/**
 * The logo tile (a placeholder graph-paper square) with the platform name. `area` replaces the
 * tagline with the staff area's name ("Admin", "Teaching") in the dark bars.
 */
export function BrandMark({
  area,
  href = '/',
  tone = 'light',
}: {
  area?: string;
  href?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <Link href={href} className={cx(styles.brand, tone === 'dark' && styles.brandDark)}>
      <span aria-hidden="true" className={styles.logo} />
      <span className={styles.brandText}>
        <span className={styles.brandName}>{area ?? PLATFORM_NAME}</span>
        {!area && <span className={styles.brandTag}>Cambridge &amp; Edexcel courses</span>}
      </span>
    </Link>
  );
}
