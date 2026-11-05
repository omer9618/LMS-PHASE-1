/**
 * Quiz countdown (#73, #75). The API enforces the deadline; the client only displays it, and
 * counts from the server's clock (`serverTime` in every attempt view), never the device's own,
 * so a wrong phone clock cannot show the wrong time left.
 */

/** Milliseconds to add to Date.now() to get the server's time. */
export function clockOffsetMs(serverTimeIso: string, receivedAtMs: number): number {
  return Date.parse(serverTimeIso) - receivedAtMs;
}

/** Milliseconds left until the deadline (never negative); null when the quiz is untimed. */
export function remainingMs(
  deadlineIso: string | null,
  offsetMs: number,
  nowMs: number,
): number | null {
  if (!deadlineIso) return null;
  return Math.max(0, Date.parse(deadlineIso) - (nowMs + offsetMs));
}

/** 754_000 → "12:34", 3_725_000 → "1:02:05". Rounds up so 0:00 means time is really up. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** A time limit in words: 600 → "10 minutes", 90 → "1 min 30 s". */
export function describeTimeLimit(seconds: number | null): string {
  if (seconds === null) return 'No time limit';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} seconds`;
  if (rest === 0) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return `${minutes} min ${rest} s`;
}

/** Warn when under a minute (or under 10% of the limit, whichever is larger) is left. */
export function isRunningLow(remaining: number, timeLimitSeconds: number | null): boolean {
  if (timeLimitSeconds === null) return false;
  return remaining <= Math.max(60_000, timeLimitSeconds * 100);
}
