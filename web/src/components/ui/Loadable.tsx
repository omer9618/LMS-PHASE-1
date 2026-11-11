import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api/errors';
import { LoadError } from './LoadError';
import { Skeleton } from './Skeleton';

/** Loading (a skeleton), error (with retry) or the data, for a `useQuery` result. */
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
  if (state.status === 'pending') return <Skeleton label={`Loading ${what}…`} />;
  if (state.status === 'error') {
    return (
      <LoadError title={`Could not load ${what}`} onRetry={() => void state.refetch()}>
        {errorMessage(state.error)}
      </LoadError>
    );
  }
  return <>{children(state.data)}</>;
}
