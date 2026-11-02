import type { Pacing } from './api/types';

/** 75 → "1 min", 3725 → "1 h 2 min". Seconds under a minute round up to 1 min. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const PACING_LABELS: Record<Pacing, string> = {
  FREE: 'Self-paced',
  SEQUENTIAL: 'Step by step',
};

export const PACING_HINTS: Record<Pacing, string> = {
  FREE: 'Open any lesson in any order.',
  SEQUENTIAL: 'Lessons unlock in order.',
};

/**
 * Where to go after signing in. Only same-site paths are accepted, so a crafted `?next=` link
 * cannot send someone to another site.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/courses'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  return raw;
}
