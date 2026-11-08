'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Teacher.module.css';

const LINKS = [
  { href: '/teacher/courses', label: 'Courses' },
  { href: '/teacher/earnings', label: 'Earnings' },
  { href: '/teacher/profile', label: 'Profile' },
];

/** The teacher area's own navigation. */
export function TeacherNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Teaching" className={styles.areaNav}>
      <ul className={styles.tabs}>
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={styles.tab}
              aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
