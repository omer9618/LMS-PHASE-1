import Link from 'next/link';
import { PLATFORM_NAME } from './BrandMark';
import styles from './Chrome.module.css';

const COLUMNS = [
  {
    label: 'Courses',
    links: [
      ['All courses', '/courses'],
      ['How payment works', '/#how'],
    ],
  },
  {
    label: 'Teaching',
    links: [
      ['Teach with us', '/teach-with-us'],
      ['Sign in', '/login'],
    ],
  },
] as const;

/** Site-wide footer for the public and student pages (staff areas have their own bar). */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerAbout}>
          <span className={styles.footerName}>{PLATFORM_NAME}</span>
          <p>Courses from independent teachers for Cambridge and Edexcel students.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.label} aria-label={column.label} className={styles.footerColumn}>
            <span className="eyebrow">{column.label}</span>
            {column.links.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <p className={styles.footerLegal}>
        © {new Date().getFullYear()} {PLATFORM_NAME}. Not affiliated with Cambridge International or
        Pearson Edexcel.
      </p>
    </footer>
  );
}
