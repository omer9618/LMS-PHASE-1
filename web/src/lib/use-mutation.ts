import { useState } from 'react';
import { ApiError, errorMessage, fieldErrors } from '@/lib/api/errors';

export interface Mutation {
  pending: boolean;
  /** The sentence to show when the last run failed. */
  error: string | null;
  /** The server's per-field messages for the last failed run (empty when none). */
  fieldErrors: Record<string, string>;
  /** The API error of the last failed run, for the few places that branch on its name. */
  failure: ApiError | null;
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
 * One write at a time: `pending` while it runs, then the `error` (with `fieldErrors` and the raw
 * `failure`) or the success `notice`. Every screen that writes uses this instead of its own
 * busy/error state, so errors read the same everywhere.
 */
export function useMutation(): Mutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setError(null);
    setFields({});
    setFailure(null);
    setNotice(null);
  }

  return {
    pending,
    error,
    fieldErrors: fields,
    failure,
    notice,
    clear: reset,
    async run(action, success, onError) {
      setPending(true);
      reset();
      try {
        await action();
        if (success) setNotice(success);
        return true;
      } catch (e) {
        if (onError?.(e) === true) return false;
        setError(errorMessage(e));
        setFields(fieldErrors(e));
        setFailure(e instanceof ApiError ? e : null);
        return false;
      } finally {
        setPending(false);
      }
    },
  };
}
