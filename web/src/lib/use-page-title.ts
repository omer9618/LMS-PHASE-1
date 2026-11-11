'use client';

import { useEffect } from 'react';

/**
 * Names the tab for a screen whose title depends on data the server did not have (an order's
 * reference, the lesson being watched), so the browser history and a screen reader's page
 * announcement tell one page from the next. `null` leaves the route's own title alone.
 */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Paperlane`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
