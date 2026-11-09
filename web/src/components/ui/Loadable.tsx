import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api/errors';
import type { ApiState } from '@/lib/use-api';
import { Alert } from './Alert';
import { Button } from './Button';

/** Loading, error (with retry) or the data, for a `useApi` result. */
export function Loadable<T>({
  state,
  what,
  children,
}: {
  state: ApiState<T> & { reload: () => void };
  /** "users", "the order": completes "Loading …" and "Could not load …". */
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <p role="status">Loading {what}…</p>;
  if (state.status === 'error') {
    return (
      <Alert tone="danger" title={`Could not load ${what}`}>
        <p>{errorMessage(state.error)}</p>
        <Button size="sm" variant="secondary" onClick={state.reload}>
          Try again
        </Button>
      </Alert>
    );
  }
  return <>{children(state.data)}</>;
}
