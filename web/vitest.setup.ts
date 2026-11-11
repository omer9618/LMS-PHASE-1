import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, type RenderHookOptions, type RenderOptions } from '@testing-library/react';
import { createElement, useState, type ReactElement, type ReactNode } from 'react';
import { afterEach, vi } from 'vitest';

/** Every rendered tree gets its own query cache, with no retries, so tests never share data. */
function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
  );
  return createElement(QueryClientProvider, { client }, children);
}

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  return {
    ...actual,
    render: ((ui: ReactElement, options?: RenderOptions) =>
      actual.render(ui, { wrapper: TestQueryProvider, ...options })) as typeof actual.render,
    renderHook: ((hook: (props: unknown) => unknown, options?: RenderHookOptions<unknown>) =>
      actual.renderHook(hook, {
        wrapper: TestQueryProvider,
        ...options,
      })) as typeof actual.renderHook,
  };
});

afterEach(() => {
  cleanup();
});
