import { useState } from 'react';
import { errorMessage } from '@/lib/api/errors';

export interface Mutation {
  pending: boolean;
  error: string | null;
  notice: string | null;
  run(action: () => Promise<unknown>, success?: string): Promise<boolean>;
  clear(): void;
}

/** One write at a time, with its error or success message. */
export function useMutation(): Mutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    pending,
    error,
    notice,
    clear: () => {
      setError(null);
      setNotice(null);
    },
    async run(action, success) {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        await action();
        if (success) setNotice(success);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setPending(false);
      }
    },
  };
}
