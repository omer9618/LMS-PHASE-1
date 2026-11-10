import { useMutation as useQueryMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, fieldErrors, RequestAbortedError, RequestError } from '@/lib/api/errors';

export interface Mutation {
  pending: boolean;
  /** The sentence to show when the last run failed. */
  error: string | null;
  /** The server's per-field messages for the last failed run (empty when none). */
  fieldErrors: Record<string, string>;
  /** The RequestError of the last failed run, for the few places that branch on its code. */
  failure: RequestError | null;
  notice: string | null;
  /** True when the action resolved; false when it threw (the error is then in `error`). */
  run(
    action: () => Promise<unknown>,
    success?: string,
    /** Look at the thrown error first; return true when handled, so no message is shown. */
    onError?: (error: unknown) => boolean | void,
  ): Promise<boolean>;
  clear(): void;
}

/**
 * One write at a time, on TanStack Query's useMutation: `pending` while it runs, then the `error`
 * (with `fieldErrors` and the raw `failure`) or the success `notice`. Screens use this for any
 * write whose action is built at the call site; a write with a fixed shape can use TanStack's
 * useMutation directly (see CartView).
 */
export function useMutation(): Mutation {
  const mutation = useQueryMutation<unknown, unknown, () => Promise<unknown>>({
    mutationFn: (action) => action(),
  });
  const [notice, setNotice] = useState<string | null>(null);
  // Kept here, set as run() settles, so it is in step with run's result. A failure the caller
  // handled itself (or a cancelled request) is not kept: it shows nothing.
  const [thrown, setThrown] = useState<unknown>(null);
  const failure = thrown instanceof RequestError ? thrown : null;

  return {
    pending: mutation.isPending,
    error: thrown === null ? null : errorMessage(thrown),
    fieldErrors: fieldErrors(failure),
    failure,
    notice,
    clear() {
      mutation.reset();
      setNotice(null);
      setThrown(null);
    },
    async run(action, success, onError) {
      setNotice(null);
      setThrown(null);
      try {
        await mutation.mutateAsync(action);
        if (success) setNotice(success);
        return true;
      } catch (error) {
        if (!(error instanceof RequestAbortedError) && onError?.(error) !== true) setThrown(error);
        return false;
      }
    },
  };
}
