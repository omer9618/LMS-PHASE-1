import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api/errors';
import { Alert } from './Alert';
import { Button } from './Button';

/** Loading, error (with retry) or the data, for a `useQuery` result. */
export function Loadable<T>({
  state,
  what,
  children,
}: {
  state: UseQueryResult<T>;
  /** "users", "the order": completes "Loading …" and "Could not load …". */
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'pending') return <p role="status">Loading {what}…</p>;
  if (state.status === 'error') {
    return (
      <Alert tone="danger" title={`Could not load ${what}`}>
        <p>{errorMessage(state.error)}</p>
        <Button size="sm" variant="secondary" onClick={() => void state.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }
  return <>{children(state.data)}</>;
}
