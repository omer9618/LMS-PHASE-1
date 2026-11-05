/**
 * Watch reporting for embedded video (#53, #91). Bunny Stream's player speaks the player.js
 * postMessage protocol: we ask it for `timeupdate`, `pause` and `ended` events and report the
 * position to the API. The API decides completion (furthest position vs. the threshold); this
 * only decides *when* to report.
 */

export type PlayerEvent =
  { kind: 'ready' } | { kind: 'time'; seconds: number } | { kind: 'pause' } | { kind: 'ended' };

/** Parses a message from the player iframe. Anything else (other frames, junk) gives null. */
export function parsePlayerMessage(data: unknown): PlayerEvent | null {
  let message: unknown = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof message !== 'object' || message === null) return null;
  const { context, event, value } = message as {
    context?: unknown;
    event?: unknown;
    value?: unknown;
  };
  if (context !== 'player.js') return null;
  switch (event) {
    case 'ready':
      return { kind: 'ready' };
    case 'pause':
      return { kind: 'pause' };
    case 'ended':
      return { kind: 'ended' };
    case 'timeupdate': {
      const seconds = (value as { seconds?: unknown } | undefined)?.seconds;
      return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
        ? { kind: 'time', seconds }
        : null;
    }
    default:
      return null;
  }
}

/** Messages to send to the player once it is ready. */
export function playerCommands(resumeAtSeconds: number | null): string[] {
  const command = (method: string, value?: unknown) =>
    JSON.stringify({ context: 'player.js', version: '0.0.11', method, value });
  const commands = ['timeupdate', 'pause', 'ended'].map((e) => command('addEventListener', e));
  if (resumeAtSeconds && resumeAtSeconds > 0)
    commands.push(command('setCurrentTime', resumeAtSeconds));
  return commands;
}

/** Report at most every `intervalMs` while playing, and always on pause or end. */
export const WATCH_REPORT_INTERVAL_MS = 15_000;

export function shouldReport(
  event: PlayerEvent,
  lastReportAtMs: number | null,
  nowMs: number,
  intervalMs = WATCH_REPORT_INTERVAL_MS,
): boolean {
  if (event.kind === 'pause' || event.kind === 'ended') return true;
  if (event.kind !== 'time') return false;
  return lastReportAtMs === null || nowMs - lastReportAtMs >= intervalMs;
}
