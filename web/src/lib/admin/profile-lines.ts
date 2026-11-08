import type { F2fLocation, SocialLink } from '@/lib/api/admin';

/**
 * Social links and face-to-face locations edited as one line each, fields separated by "|".
 * The API validates them (http(s) links only, length limits); these only split and join.
 */

const split = (line: string) => line.split('|').map((part) => part.trim());

export function linksToLines(links: SocialLink[]): string {
  return links.map((l) => `${l.label} | ${l.url}`).join('\n');
}

/** "YouTube | https://…" per line. A line without a label uses the URL's host as its label. */
export function linesToLinks(text: string): SocialLink[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = split(line);
      if (parts.length === 1) {
        const url = parts[0]!;
        let label = url;
        try {
          label = new URL(url).hostname;
        } catch {
          // left as typed: the API will reject a bad URL with a clear message
        }
        return { label, url };
      }
      return { label: parts[0]!, url: parts.slice(1).join('|').trim() };
    });
}

export function locationsToLines(locations: F2fLocation[]): string {
  return locations
    .map((l) => [l.city, l.area ?? '', l.notes ?? ''].join(' | ').replace(/( \| )+$/, ''))
    .join('\n');
}

/** "City | Area | Notes" per line; area and notes optional. */
export function linesToLocations(text: string): F2fLocation[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [city = '', area = '', ...notes] = split(line);
      const location: F2fLocation = { city };
      if (area) location.area = area;
      const note = notes.join(' | ').trim();
      if (note) location.notes = note;
      return location;
    });
}
