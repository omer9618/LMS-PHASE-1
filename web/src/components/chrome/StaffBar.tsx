'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import styles from './Chrome.module.css';

export interface StaffLink {
  href: string;
  label: string;
  current: boolean;
  /** Items waiting, shown as a highlighter count; nothing when 0 or unknown. */
  count?: number | null;
}

/** The dark bar at the top of a staff area: area name, its links, and an optional right side. */
export function StaffBar({
  area,
  home,
  label,
  links,
  aside,
}: {
  area: string;
  /** Where the area name links to ("/teacher/courses"). */
  home: string;
  /** Accessible name of the navigation ("Teaching"). */
  label: string;
  links: StaffLink[];
  aside?: ReactNode;
}) {
  return (
    <div className={styles.staffBar}>
      <div className={styles.staffInner}>
        <BrandMark area={area} href={home} tone="dark" />
        <nav aria-label={label} className={styles.staffNav}>
          <ul className={styles.staffList}>
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={styles.staffLink}
                  aria-current={link.current ? 'page' : undefined}
                >
                  {link.label}
                  {typeof link.count === 'number' && link.count > 0 && (
                    <span className={styles.count} aria-label={`${link.count} waiting`}>
                      {link.count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {aside && <div className={styles.staffAside}>{aside}</div>}
      </div>
    </div>
  );
}
