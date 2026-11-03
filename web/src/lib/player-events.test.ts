import { describe, expect, it } from 'vitest';
import { parsePlayerMessage, playerCommands, shouldReport } from './player-events';

describe('player events', () => {
  it('parses player.js messages, as strings or objects', () => {
    expect(
      parsePlayerMessage(
        JSON.stringify({ context: 'player.js', event: 'timeupdate', value: { seconds: 12.5 } }),
      ),
    ).toEqual({ kind: 'time', seconds: 12.5 });
    expect(parsePlayerMessage({ context: 'player.js', event: 'ready' })).toEqual({
      kind: 'ready',
    });
    expect(parsePlayerMessage({ context: 'player.js', event: 'ended' })).toEqual({
      kind: 'ended',
    });
  });

  it('ignores other frames and junk', () => {
    expect(parsePlayerMessage('not json')).toBeNull();
    expect(parsePlayerMessage({ context: 'other', event: 'ready' })).toBeNull();
    expect(
      parsePlayerMessage({ context: 'player.js', event: 'timeupdate', value: { seconds: -1 } }),
    ).toBeNull();
    expect(parsePlayerMessage({ context: 'player.js', event: 'volumechange' })).toBeNull();
    expect(parsePlayerMessage(null)).toBeNull();
  });

  it('subscribes to events and resumes when a position is known', () => {
    const plain = playerCommands(null).map((c) => JSON.parse(c));
    expect(plain.map((c) => c.value)).toEqual(['timeupdate', 'pause', 'ended']);
    const resumed = playerCommands(42).map((c) => JSON.parse(c));
    expect(resumed.at(-1)).toMatchObject({ method: 'setCurrentTime', value: 42 });
  });

  it('throttles time reports but always reports pause and end', () => {
    const t = { kind: 'time', seconds: 5 } as const;
    expect(shouldReport(t, null, 0)).toBe(true);
    expect(shouldReport(t, 0, 14_999)).toBe(false);
    expect(shouldReport(t, 0, 15_000)).toBe(true);
    expect(shouldReport({ kind: 'pause' }, 0, 1)).toBe(true);
    expect(shouldReport({ kind: 'ended' }, 0, 1)).toBe(true);
    expect(shouldReport({ kind: 'ready' }, null, 0)).toBe(false);
  });
});
