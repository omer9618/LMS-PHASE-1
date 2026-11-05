import { z } from 'zod';

/** Empty or whitespace-only text clears the field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value.length === 0 ? null : value));

export const MAX_SOCIAL_LINKS = 10;
export const MAX_F2F_LOCATIONS = 20;

/** Only http(s) links to a real domain: no javascript:, mailto:, data: or bare hosts. */
export const socialLinkSchema = z.strictObject({
  label: z.string().trim().min(1).max(50),
  url: z
    .url({ protocol: /^https?$/, hostname: z.regexes.domain, error: 'Must be an http(s) link' })
    .max(500),
});

export const f2fLocationSchema = z.strictObject({
  city: z.string().trim().min(2).max(100),
  area: z.string().trim().min(1).max(100).optional(),
  notes: z.string().trim().min(1).max(300).optional(),
});

/**
 * #98/#100: a partial edit of the profile fields. Omitted fields stay as they are; null (or empty
 * text) clears a text field and [] clears a list. Publishing and the photo have their own routes.
 */
export const updateProfileSchema = z.strictObject({
  bio: optionalText(5000).optional(),
  qualifications: optionalText(2000).optional(),
  socialLinks: z.array(socialLinkSchema).max(MAX_SOCIAL_LINKS).optional(),
  f2fLocations: z.array(f2fLocationSchema).max(MAX_F2F_LOCATIONS).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const teacherIdParamsSchema = z.object({ teacherId: z.uuid() });
export type TeacherIdParams = z.infer<typeof teacherIdParamsSchema>;

export const publicProfileQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type PublicProfileQuery = z.infer<typeof publicProfileQuerySchema>;

/** #100: moderation actions carry a reason, which is audited. */
export const moderationReasonSchema = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
});
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;
