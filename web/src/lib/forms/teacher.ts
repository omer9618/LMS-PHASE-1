import { z } from 'zod';
import { formatBytes } from '@/lib/format';

/** Mirrors the API's lesson resource policy (#38): PDF, at most 25 MB. */
export const RESOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const resourceFile = z
  .custom<File>(
    (value) => typeof File !== 'undefined' && value instanceof File,
    'Choose a PDF file',
  )
  .superRefine((file, ctx) => {
    if (!/\.pdf$/i.test(file.name)) {
      ctx.addIssue({ code: 'custom', message: 'Only PDF files can be attached' });
    } else if (file.size === 0) {
      ctx.addIssue({ code: 'custom', message: 'This file is empty' });
    } else if (file.size > RESOURCE_MAX_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `The file must be at most ${formatBytes(RESOURCE_MAX_BYTES)} (this one is ${formatBytes(file.size)})`,
      });
    }
  });
