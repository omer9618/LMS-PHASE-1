import { z } from 'zod';
import { formatBytes } from '@/lib/format';

/**
 * Field rules shared by every form, written once. They mirror the API's limits for instant
 * feedback; the API stays the authority. Form schemas take text boxes in (strings, files) and
 * give the request body out, so each form validates and builds its body in one place.
 */

export const PASSWORD_MIN_LENGTH = 10;

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

/** A required email address. */
export const email = z.string().trim().regex(EMAIL_SHAPE, 'Enter a valid email address');

/** An email box that may stay empty; empty becomes undefined. */
export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || EMAIL_SHAPE.test(v), 'Enter a valid email address, or leave it empty')
  .transform((v) => (v === '' ? undefined : v));

/** A person's full name. */
export const fullName = z.string().trim().min(2, 'Enter your full name');

/** An optional name box: empty is fine, a single letter is not. */
export const optionalName = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || v.length >= 2, message)
    .transform((v) => (v === '' ? undefined : v));

/** Free text that may stay empty; empty becomes undefined. */
export const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v));

export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`);

/** Mirrors the API's CV upload policy (#19): PDF or Word, at most 5 MB. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CV_EXTENSIONS = ['pdf', 'doc', 'docx'];

export const cvFile = z
  .custom<File>((value) => typeof File !== 'undefined' && value instanceof File, 'Attach your CV')
  .superRefine((file, ctx) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!CV_EXTENSIONS.includes(extension)) {
      ctx.addIssue({ code: 'custom', message: 'The CV must be a PDF or Word document' });
    } else if (file.size > CV_MAX_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `The CV must be at most ${formatBytes(CV_MAX_BYTES)} (this one is ${formatBytes(file.size)})`,
      });
    } else if (file.size === 0) {
      ctx.addIssue({ code: 'custom', message: 'This file is empty' });
    }
  });
