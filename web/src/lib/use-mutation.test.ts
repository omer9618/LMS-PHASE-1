import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useMutation } from './use-mutation';

const validation = new ApiError('VALIDATION_FAILED', 'Check the form', {
  info: { issues: [{ path: 'email', message: 'Not an email' }] },
});

describe('useMutation', () => {
  it('reports success with the notice', async () => {
    const { result } = renderHook(() => useMutation());
    let ok = false;
    await act(async () => {
      ok = await result.current.run(async () => undefined, 'Saved.');
    });
    expect(ok).toBe(true);
    expect(result.current.notice).toBe('Saved.');
    expect(result.current.pending).toBe(false);
  });

  it('keeps the message, the field errors and the raw failure when the action throws', async () => {
    const { result } = renderHook(() => useMutation());
    await act(async () => {
      await result.current.run(() => Promise.reject(validation));
    });
    expect(result.current.error).toBe('Check the form');
    expect(result.current.fieldErrors).toEqual({ email: 'Not an email' });
    expect(result.current.failure).toBe(validation);
  });

  it('lets onError handle a failure so no message shows', async () => {
    const { result } = renderHook(() => useMutation());
    let seen: unknown;
    let ok = true;
    await act(async () => {
      ok = await result.current.run(
        () => Promise.reject(validation),
        undefined,
        (e) => {
          seen = e;
          return true;
        },
      );
    });
    expect(ok).toBe(false);
    expect(seen).toBe(validation);
    expect(result.current.error).toBeNull();
  });

  it('clears the previous failure on the next run', async () => {
    const { result } = renderHook(() => useMutation());
    await act(async () => {
      await result.current.run(() => Promise.reject(validation));
    });
    await act(async () => {
      await result.current.run(async () => undefined);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.fieldErrors).toEqual({});
  });
});
