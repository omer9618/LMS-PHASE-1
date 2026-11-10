import { MutationObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from './query';

describe('createQueryClient', () => {
  it('marks every cached query stale after a successful write', async () => {
    const client = createQueryClient();
    client.setQueryData(['orders'], []);
    expect(client.getQueryState(['orders'])?.isInvalidated).toBe(false);

    await new MutationObserver(client, { mutationFn: async () => 'ok' }).mutate();

    expect(client.getQueryState(['orders'])?.isInvalidated).toBe(true);
    // Still cached: nothing was thrown away, only marked to ask again.
    expect(client.getQueryData(['orders'])).toEqual([]);
  });

  it('leaves the cache alone after a failed write', async () => {
    const client = createQueryClient();
    client.setQueryData(['orders'], []);

    await expect(
      new MutationObserver(client, {
        mutationFn: async () => {
          throw new Error('no');
        },
      }).mutate(),
    ).rejects.toThrow('no');

    expect(client.getQueryState(['orders'])?.isInvalidated).toBe(false);
  });
});
