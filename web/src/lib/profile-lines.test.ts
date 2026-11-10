import { describe, expect, it } from 'vitest';
import { linesToLinks, linesToLocations, linksToLines, locationsToLines } from './profile-lines';

describe('profile line editing', () => {
  it('round-trips social links', () => {
    const links = [
      { label: 'YouTube', url: 'https://youtube.com/@t' },
      { label: 'Site', url: 'https://t.example.com' },
    ];
    expect(linesToLinks(linksToLines(links))).toEqual(links);
  });

  it('uses the host as the label for a bare URL and skips blank lines', () => {
    expect(linesToLinks('\nhttps://www.example.com/x\n  \n')).toEqual([
      { label: 'www.example.com', url: 'https://www.example.com/x' },
    ]);
  });

  it('round-trips locations, leaving out empty optional parts', () => {
    const locations = [
      { city: 'Lahore', area: 'Gulberg', notes: 'Weekends' },
      { city: 'Karachi' },
      { city: 'Islamabad', area: 'F-7' },
    ];
    expect(locationsToLines(locations)).toBe(
      'Lahore | Gulberg | Weekends\nKarachi\nIslamabad | F-7',
    );
    expect(linesToLocations(locationsToLines(locations))).toEqual(locations);
    expect(linesToLocations('Multan |  | Evenings only')).toEqual([
      { city: 'Multan', notes: 'Evenings only' },
    ]);
  });
});
