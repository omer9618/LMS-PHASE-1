import { vi } from 'vitest';

/**
 * Shared test doubles. Use from a test file with:
 *
 *   vi.mock('next/navigation', () => navigationMock);
 *   vi.mock('@/lib/api/client', () => apiClientMock);
 *
 * then drive `router`, `setSearch()` and `apiMock` in the tests.
 */

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

let search = new URLSearchParams();
let pathname = '/';

export function setSearch(qs: string) {
  search = new URLSearchParams(qs);
}

export function setPathname(path: string) {
  pathname = path;
}

export const navigationMock = {
  useRouter: () => router,
  useSearchParams: () => search,
  usePathname: () => pathname,
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: vi.fn(),
};

export const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
};

export const apiClientMock = { api: apiMock };

export function resetMocks() {
  for (const fn of [...Object.values(router), ...Object.values(apiMock)]) fn.mockReset();
  search = new URLSearchParams();
  pathname = '/';
}
