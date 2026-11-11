import Link from 'next/link';
import { cx } from '@/components/ui/cx';
import styles from './Chrome.module.css';
import { LogoMark } from './LogoMark';

/** The platform's name, as written in sentences. The wordmark sets it in lower case. */
export const PLATFORM_NAME = 'Paperlane';

/**
 * The Paperlane mark with the wordmark ("paper" in ink, "lane" in exam blue). `area` replaces the
 * wordmark with the staff area's name ("Admin", "Teaching") in the dark bars; the link is still
 * announced as Paperlane.
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
  const dark = tone === 'dark';
  return (
    <Link
      href={href}
      className={cx(styles.brand, dark && styles.brandDark)}
      aria-label={area ? `${PLATFORM_NAME} ${area}` : PLATFORM_NAME}
    >
      <LogoMark size={dark ? 28 : 36} />
      <span className={styles.brandText}>
        {area ? (
          <span className={styles.brandName}>{area}</span>
        ) : (
          <>
            <span className={styles.brandName}>
              paper<span className={styles.brandLane}>lane</span>
            </span>
            <span className="eyebrow">Cambridge &amp; Edexcel courses</span>
          </>
        )}
      </span>
    </Link>
  );
}
