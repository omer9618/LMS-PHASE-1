import type { ReactNode } from 'react';
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
}: {
  /** "Could not load your courses" */
  title: string;
  children: ReactNode;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <Alert tone="danger" title={title}>
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
