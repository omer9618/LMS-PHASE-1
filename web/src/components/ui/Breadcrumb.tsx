import Link from 'next/link';
import { Fragment } from 'react';
import styles from './Breadcrumb.module.css';

export interface Crumb {
  label: string;
  /** Omit for the page you are on. */
  href?: string;
}

/** Where you are, in the words people gave things (never upper-cased). The last crumb is the page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.crumbs}>
      <ol>
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            <li>
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
            {index < items.length - 1 && (
              <li aria-hidden="true" className={styles.sep}>
                /
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
