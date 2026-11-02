import { MAX_F2F_LOCATIONS, MAX_SOCIAL_LINKS, updateProfileSchema } from './teacher-profile.schema';

const parse = (body: unknown) => updateProfileSchema.safeParse(body);

describe('updateProfileSchema (#98)', () => {
  it('accepts a full profile and trims text', () => {
    const result = parse({
      bio: '  Physics teacher  ',
      qualifications: 'MSc',
      socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/@teacher' }],
      f2fLocations: [{ city: 'Lahore', area: 'Gulberg', notes: 'Weekends' }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.bio).toBe('Physics teacher');
  });

  it('turns empty text into null, so it clears the field', () => {
    expect(parse({ bio: '   ' }).data?.bio).toBeNull();
    expect(parse({ qualifications: null }).data?.qualifications).toBeNull();
  });

  it('accepts an empty body (nothing changes)', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'ftp://example.com/file',
    'mailto:someone@example.com',
    'data:text/html,hi',
    'https://localhost',
    'not a url',
  ])('rejects the social link %s', (url) => {
    expect(parse({ socialLinks: [{ label: 'x', url }] }).success).toBe(false);
  });

  it('accepts http and https links', () => {
    expect(parse({ socialLinks: [{ label: 'a', url: 'http://example.org' }] }).success).toBe(true);
  });

  it('rejects links without a label, unknown keys and too many links', () => {
    expect(parse({ socialLinks: [{ label: '', url: 'https://a.com' }] }).success).toBe(false);
    expect(parse({ socialLinks: [{ label: 'a', url: 'https://a.com', x: 1 }] }).success).toBe(
      false,
    );
    const many = Array.from({ length: MAX_SOCIAL_LINKS + 1 }, (_, i) => ({
      label: `l${i}`,
      url: `https://site${i}.com`,
    }));
    expect(parse({ socialLinks: many }).success).toBe(false);
  });

  it('validates face-to-face locations', () => {
    expect(parse({ f2fLocations: [{ city: 'Karachi' }] }).success).toBe(true);
    expect(parse({ f2fLocations: [{ area: 'DHA' }] }).success).toBe(false);
    expect(parse({ f2fLocations: [{ city: 'K' }] }).success).toBe(false);
    expect(parse({ f2fLocations: [{ city: 'Karachi', notes: 'x'.repeat(301) }] }).success).toBe(
      false,
    );
    const many = Array.from({ length: MAX_F2F_LOCATIONS + 1 }, () => ({ city: 'Lahore' }));
    expect(parse({ f2fLocations: many }).success).toBe(false);
  });

  it('rejects over-long text and fields that are not editable here', () => {
    expect(parse({ bio: 'x'.repeat(5001) }).success).toBe(false);
    expect(parse({ isPublished: true }).success).toBe(false);
    expect(parse({ photoUrl: 'https://evil.com/x.png' }).success).toBe(false);
  });
});
