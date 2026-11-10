import { z } from 'zod';
import { checkLinkUrl, MAX_F2F_LOCATIONS, MAX_SOCIAL_LINKS } from '@/lib/api/profile';

/** A teacher's public profile (#98): text boxes in, the PUT body out. */
export const profileForm = z.object({
  bio: z
    .string()
    .trim()
    .transform((v) => v || null),
  qualifications: z
    .string()
    .trim()
    .transform((v) => v || null),
  socialLinks: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Give the link a label'),
        url: z
          .string()
          .trim()
          .superRefine((url, ctx) => {
            const problem = checkLinkUrl(url);
            if (problem) ctx.addIssue({ code: 'custom', message: problem });
          }),
      }),
    )
    .max(MAX_SOCIAL_LINKS),
  f2fLocations: z
    .array(
      z.object({
        city: z.string().trim().min(2, 'Enter the city'),
        // Empty optional boxes are left out of the body (the API rejects "").
        area: z
          .string()
          .trim()
          .transform((v) => v || undefined),
        notes: z
          .string()
          .trim()
          .transform((v) => v || undefined),
      }),
    )
    .max(MAX_F2F_LOCATIONS),
});
