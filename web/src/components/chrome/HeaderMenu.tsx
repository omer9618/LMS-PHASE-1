'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import styles from './SiteHeader.module.css';

/**
 * The header row: the brand always, and the links and account controls in `children`. From the
 * narrow breakpoint down the children sit behind a Menu button so the header stays one row tall
 * and the page starts above the fold; on wider screens the button is hidden and nothing changes.
 */
export function HeaderMenu({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  // The menu is open for one page: following a link changes the path and so closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className={styles.inner}>
      {brand}
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {open ? 'Close' : 'Menu'}
      </button>
      <div id={panelId} className={styles.panel} data-open={open}>
        {children}
      </div>
    </div>
  );
}
