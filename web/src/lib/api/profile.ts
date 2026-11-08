import { api } from './client';
import type { CatalogueListing } from './types';

export interface SocialLink {
  label: string;
  url: string;
}

export interface F2fLocation {
  city: string;
  area?: string;
  notes?: string;
}

/** GET /teacher/profile (#98). */
export interface TeacherProfile {
  teacherId: string;
  fullName: string | null;
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
  photoUrl: string | null;
  isPublished: boolean;
  /** Set while unpublished by an admin (#100). */
  moderation: { unpublishedAt: string; reason: string | null } | null;
}

/** GET /teachers/:teacherId (#99, #101). */
export interface PublicTeacherProfile {
  teacherId: string;
  fullName: string | null;
  bio: string | null;
  qualifications: string | null;
  socialLinks: SocialLink[];
  f2fLocations: F2fLocation[];
  photoUrl: string | null;
  courses: CatalogueListing;
}

export interface ProfileUpdate {
  bio?: string | null;
  qualifications?: string | null;
  socialLinks?: SocialLink[];
  f2fLocations?: F2fLocation[];
}

/** Mirrors the API's limits (src/modules/profiles/schemas/teacher-profile.schema.ts). */
export const MAX_SOCIAL_LINKS = 10;
export const MAX_F2F_LOCATIONS = 20;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const profileApi = {
  get: (signal?: AbortSignal) => api.get<TeacherProfile>('/teacher/profile', undefined, signal),
  update: (body: ProfileUpdate) => api.put<TeacherProfile>('/teacher/profile', body),
  publish: () => api.post<TeacherProfile>('/teacher/profile/publish'),
  unpublish: () => api.post<TeacherProfile>('/teacher/profile/unpublish'),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append('photo', file);
    return api.postForm<TeacherProfile>('/teacher/profile/photo', form);
  },
  removePhoto: () => api.delete<TeacherProfile>('/teacher/profile/photo'),
};

/** Only http(s) links with a dotted host, as the API accepts. Returns an error or undefined. */
export function checkLinkUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return 'Enter a full link starting with https://';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only http(s) links are allowed';
  }
  if (!parsed.hostname.includes('.')) return 'Enter a link to a real website';
  return undefined;
}

export function checkPhoto(file: File | null): string | undefined {
  if (!file) return 'Choose a photo';
  if (!PHOTO_TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image';
  if (file.size > PHOTO_MAX_BYTES) return 'The photo must be at most 2 MB';
  return undefined;
}

/** "Lahore · Gulberg" */
export function locationLabel(location: F2fLocation): string {
  return [location.city, location.area].filter(Boolean).join(' · ');
}
