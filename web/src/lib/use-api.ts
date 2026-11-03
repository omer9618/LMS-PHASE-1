'use client';

import { useEffect, useState } from 'react';
import { ApiError } from './api/errors';

export type ApiState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: ApiError };

/**
 * Loads `load()` whenever `key` changes; `null` skips loading. Results are tagged with the key
 * they belong to, so a slow answer for an old key never shows under a new one, and the state
 * reads "loading" as soon as the key changes.
 */
export function useApi<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): ApiState<T> & { reload: () => void } {
  const [result, setResult] = useState<{ key: string; state: ApiState<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tagged = key === null ? null : `${attempt}:${key}`;

  useEffect(() => {
    if (tagged === null) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setResult({ key: tagged, state: { status: 'success', data } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError('BAD_RESPONSE', 'Request failed');
        setResult({ key: tagged, state: { status: 'error', error: apiError } });
      },
    );
    return () => controller.abort();
    // `load` is re-created every render; the key says when the request really changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagged]);

  const state: ApiState<T> = result && result.key === tagged ? result.state : { status: 'loading' };
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
