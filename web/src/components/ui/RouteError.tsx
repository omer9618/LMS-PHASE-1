'use client';

import { useEffect } from 'react';
import { LoadError } from './LoadError';

/**
 * The page an `error.tsx` shows when something throws while rendering: plain words, a retry, and
 * a way back, inside the same frame as the page it replaces. The three route segments share it.
 */
export function RouteError({
  error,
  retry,
  backHref = '/',
  backLabel = 'Home',
}: {
  error: unknown;
  /** Re-fetches and re-renders the segment (this Next version's `retry`). */
  retry: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    // Nothing else reports render errors from the browser; keep them in the console.
    console.error(error);
  }, [error]);
  return (
    <div className="page stack">
      <LoadError
        title="Something went wrong on our side"
        onRetry={retry}
        backHref={backHref}
        backLabel={backLabel}
      >
        This page could not be shown. Trying again usually works; if it keeps happening, tell us
        what you were doing.
      </LoadError>
    </div>
  );
}
