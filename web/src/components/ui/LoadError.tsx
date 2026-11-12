'use client';

import type { ReactNode } from 'react';
import { usePageTitle } from '@/lib/use-page-title';
import { Alert } from './Alert';
import { BackLink } from './BackLink';
import { Button } from './Button';

/**
 * A failed load, the same everywhere: what could not be loaded, why in plain words, and the two
 * ways out (try again, go back). Never a dead end.
 */
export function LoadError({
  title,
  children,
  onRetry,
  backHref,
  backLabel,
  page = false,
}: {
  /** "Could not load your courses" */
  title: string;
  children: ReactNode;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
  /**
   * The error is the page's whole content (the screen it replaces had the h1): the title becomes
   * the h1 and names the browser tab, so the page is not left headless under the old title.
   */
  page?: boolean;
}) {
  usePageTitle(page ? title : null);
  return (
    <Alert tone="danger" title={title} titleAs={page ? 'h1' : 'p'}>
      <p>{children}</p>
      {onRetry && (
        <p>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </p>
      )}
      {backHref && <BackLink href={backHref}>{backLabel ?? 'Go back'}</BackLink>}
    </Alert>
  );
}
