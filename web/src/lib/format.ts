import type { Pacing } from './api/schemas/catalogue';

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
 *
 * Browsers delete tab and newline characters from a URL before parsing it, so "/<tab>/evil.example"
 * becomes "//evil.example" and leaves the site. The text is therefore refused if it holds any
 * control character or backslash, and then resolved the way a browser would, to prove it stays here.
 */
const SAME_SITE_BASE = 'https://same-site.invalid';

export function safeNextPath(raw: string | null | undefined, fallback = '/courses'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || char === '\\') return fallback;
  }
  try {
    const resolved = new URL(raw, SAME_SITE_BASE);
    return resolved.origin === SAME_SITE_BASE ? raw : fallback;
  } catch {
    return fallback;
  }
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

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** An ISO timestamp as "3 Nov 2026, 14:05 GMT+5" in the viewer's time zone; "" when missing or invalid. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date);
}

/** 0 → "under an hour", 5 → "5 h", 50 → "2 d 2 h". For queue and concern ageing. */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return 'under an hour';
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return `${hours} h`;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

/** Minutes waiting → the same wording as formatAgeHours. */
export function formatAgeMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  return formatAgeHours(Math.floor(minutes / 60));
}

/** Today's date as YYYY-MM-DD in UTC (bank value dates and transfer dates). */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
