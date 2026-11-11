'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { RequestError } from './api/errors';

// Every query and mutation rejects with a RequestError (lib/api/client.ts), so `error` is typed
// as one everywhere.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: RequestError;
  }
}

/** Retries only what may work later (network, 5xx); a 4xx answer will not change on its own. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof RequestError && error.retryable;
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // After any successful write, every cached answer may be out of date (an order changes the
    // cart, the orders list and the dashboard). Mark them all stale without refetching: the
    // screen on show keeps its data (it refetches what it needs itself), and any other screen
    // asks again when it is next opened instead of showing up to 30 s old data.
    mutationCache: new MutationCache({
      onSuccess: () => client.invalidateQueries({ refetchType: 'none' }),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Fresh for 30 s: going back to a page shows what was there without a spinner, and the
        // next visit after that asks again.
        staleTime: 30_000,
        // Pages hold drafts built from loaded data; a background refetch must not surprise them.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

/** One query cache per browser tab (per request on the server). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
