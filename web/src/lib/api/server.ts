import { createApiClient } from './client';

/**
 * The API client for Server Components: talks to the API directly over the internal network
 * (API_URL, the same address the /api rewrite uses). Public endpoints only: no cookies are sent,
 * so nothing here can act as the visitor. Answers are cached for a minute.
 */
export const serverApi = createApiClient({
  baseUrl: (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  fetchImpl: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }),
});
