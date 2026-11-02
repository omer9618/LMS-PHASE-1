import { DomainError } from '../../../common/errors/domain.error';

/**
 * Teacher public profile rules (#98–#100). Pure.
 *
 * A profile is private until its teacher publishes it. Publishing needs a bio, so a public page
 * is never empty. While published, an edit may not remove what publishing requires: unpublish
 * first. An admin may unpublish any profile (with a reason) and edit its fields (#100).
 */

export interface SocialLink {
  label: string;
  url: string;
}

export interface F2fLocation {
  city: string;
  area?: string;
  notes?: string;
}

export interface ProfileFields {
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
}

export interface ProfileState extends ProfileFields {
  isPublished: boolean;
}

/** A partial edit: omitted fields stay as they are; null clears a text field. */
export type ProfileEdit = Partial<ProfileFields>;

export const EDITABLE_FIELDS = ['bio', 'qualifications', 'socialLinks', 'f2fLocations'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** The state of a teacher who has never saved a profile. */
export const EMPTY_PROFILE: ProfileState = {
  bio: null,
  qualifications: null,
  socialLinks: [],
  f2fLocations: [],
  isPublished: false,
};

export class ProfileIncompleteError extends DomainError {
  readonly code = 'PROFILE_INCOMPLETE';

  constructor(missing: EditableField[], message: string) {
    super(message, { missing });
  }
}

export class InvalidProfileTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
}

/** Fields a profile must have to be public. */
export function missingForPublish(profile: ProfileFields): EditableField[] {
  const missing: EditableField[] = [];
  if (!profile.bio || profile.bio.trim().length === 0) missing.push('bio');
  return missing;
}

export function decidePublish(profile: ProfileState): { isPublished: true } {
  if (profile.isPublished) {
    throw new InvalidProfileTransitionError('The profile is already published');
  }
  const missing = missingForPublish(profile);
  if (missing.length > 0) {
    throw new ProfileIncompleteError(missing, `Add ${missing.join(', ')} before publishing`);
  }
  return { isPublished: true };
}

export function decideUnpublish(profile: ProfileState): { isPublished: false } {
  if (!profile.isPublished) {
    throw new InvalidProfileTransitionError('The profile is not published');
  }
  return { isPublished: false };
}

/**
 * Applies an edit and returns the resulting fields and which ones actually changed.
 * Refuses an edit that would leave a published profile without what publishing requires.
 */
export function decideEdit(
  current: ProfileState,
  edit: ProfileEdit,
): { next: ProfileFields; changed: EditableField[] } {
  const next: ProfileFields = {
    bio: edit.bio !== undefined ? edit.bio : current.bio,
    qualifications:
      edit.qualifications !== undefined ? edit.qualifications : current.qualifications,
    socialLinks: edit.socialLinks ?? current.socialLinks,
    f2fLocations: edit.f2fLocations ?? current.f2fLocations,
  };
  if (current.isPublished) {
    const missing = missingForPublish(next);
    if (missing.length > 0) {
      throw new ProfileIncompleteError(
        missing,
        `A published profile needs ${missing.join(', ')}. Unpublish it first to remove that.`,
      );
    }
  }
  const changed = EDITABLE_FIELDS.filter(
    (field) => JSON.stringify(next[field]) !== JSON.stringify(current[field]),
  );
  return { next, changed };
}

/** Reads a JSON column defensively: anything that is not an array of objects becomes []. */
export function readJsonList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => typeof item === 'object' && item !== null);
}
