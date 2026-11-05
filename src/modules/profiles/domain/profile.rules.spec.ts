import {
  decideEdit,
  decidePublish,
  decideUnpublish,
  EMPTY_PROFILE,
  InvalidProfileTransitionError,
  missingForPublish,
  ProfileIncompleteError,
  ProfileState,
  readJsonList,
} from './profile.rules';

const complete: ProfileState = {
  bio: 'I teach A-level physics.',
  qualifications: 'MSc Physics',
  socialLinks: [{ label: 'Site', url: 'https://example.com' }],
  f2fLocations: [{ city: 'Lahore' }],
  isPublished: false,
};

describe('profile rules', () => {
  describe('publish', () => {
    it('publishes a profile with a bio', () => {
      expect(decidePublish(complete)).toEqual({ isPublished: true });
    });

    it('refuses an empty or blank bio, naming the missing field', () => {
      expect(() => decidePublish(EMPTY_PROFILE)).toThrow(ProfileIncompleteError);
      expect(() => decidePublish({ ...complete, bio: '   ' })).toThrow(ProfileIncompleteError);
      try {
        decidePublish(EMPTY_PROFILE);
      } catch (error) {
        expect((error as ProfileIncompleteError).info).toEqual({ missing: ['bio'] });
      }
    });

    it('refuses to publish twice', () => {
      expect(() => decidePublish({ ...complete, isPublished: true })).toThrow(
        InvalidProfileTransitionError,
      );
    });

    it('only bio is required', () => {
      expect(missingForPublish({ ...EMPTY_PROFILE, bio: 'x' })).toEqual([]);
    });
  });

  describe('unpublish', () => {
    it('unpublishes a published profile', () => {
      expect(decideUnpublish({ ...complete, isPublished: true })).toEqual({ isPublished: false });
    });

    it('refuses an unpublished profile', () => {
      expect(() => decideUnpublish(complete)).toThrow(InvalidProfileTransitionError);
    });
  });

  describe('edit', () => {
    it('keeps omitted fields, clears with null and reports what changed', () => {
      const { next, changed } = decideEdit(complete, {
        qualifications: null,
        f2fLocations: [{ city: 'Karachi', area: 'DHA' }],
      });
      expect(next).toEqual({
        bio: complete.bio,
        qualifications: null,
        socialLinks: complete.socialLinks,
        f2fLocations: [{ city: 'Karachi', area: 'DHA' }],
      });
      expect(changed).toEqual(['qualifications', 'f2fLocations']);
    });

    it('reports no change when values are equal', () => {
      expect(decideEdit(complete, { bio: complete.bio }).changed).toEqual([]);
    });

    it('lets an unpublished profile drop its bio', () => {
      expect(decideEdit(complete, { bio: null }).next.bio).toBeNull();
    });

    it('refuses to remove the bio of a published profile', () => {
      expect(() => decideEdit({ ...complete, isPublished: true }, { bio: null })).toThrow(
        ProfileIncompleteError,
      );
    });
  });

  it('reads JSON lists defensively', () => {
    expect(readJsonList(null)).toEqual([]);
    expect(readJsonList({ a: 1 })).toEqual([]);
    expect(readJsonList([{ city: 'X' }, 'junk', null])).toEqual([{ city: 'X' }]);
  });
});
