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

/** 5242880 → "5 MB", 1536 → "1.5 KB". For file sizes shown to people. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** An API enum value as words: "PENDING_APPROVAL" → "Pending approval". */
export function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An ISO timestamp as "2 Nov 2026" in the viewer's time zone; "" when missing or invalid. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date);
}
