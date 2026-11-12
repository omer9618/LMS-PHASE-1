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
 *
 * The "Cambridge & Edexcel courses" tagline sits beside the link, not in it: the link's name is
 * "Paperlane", and its visible text has to match that name (WCAG 2.5.3) without the tagline being
 * read out on every page. It is laid over the link's box, so it looks and clicks as one block.
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
  if (area) {
    return (
      <Link
        href={href}
        className={cx(styles.brand, dark && styles.brandDark)}
        aria-label={`${PLATFORM_NAME} ${area}`}
      >
        <LogoMark size={dark ? 28 : 36} />
        <span className={styles.brandText}>
          <span className={styles.brandName}>{area}</span>
        </span>
      </Link>
    );
  }
  return (
    <div className={styles.brandBlock}>
      <Link
        href={href}
        className={cx(styles.brand, dark && styles.brandDark)}
        aria-label={PLATFORM_NAME}
      >
        <LogoMark size={dark ? 28 : 36} />
        <span className={styles.brandName}>
          paper<span className={styles.brandLane}>lane</span>
        </span>
      </Link>
      <span className={cx('eyebrow', styles.brandTag)}>Cambridge &amp; Edexcel courses</span>
    </div>
  );
}
