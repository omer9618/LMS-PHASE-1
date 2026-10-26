import { DomainError } from '../../../common/errors/domain.error';

/**
 * Upload rules (pure). A file is accepted only if its size is within the limit and its *content*
 * matches an allowed type. The client's claimed MIME type and filename are not trusted.
 */
export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'docx' | 'doc';

interface KindSpec {
  mime: string;
  extension: string;
  matches(head: Buffer): boolean;
}

const startsWith = (head: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, i) => head[offset + i] === byte);

const KINDS: Record<FileKind, KindSpec> = {
  pdf: {
    mime: 'application/pdf',
    extension: 'pdf',
    matches: (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  },
  png: {
    mime: 'image/png',
    extension: 'png',
    matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  jpeg: { mime: 'image/jpeg', extension: 'jpg', matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  webp: {
    mime: 'image/webp',
    extension: 'webp',
    matches: (h) =>
      startsWith(h, [0x52, 0x49, 0x46, 0x46]) && startsWith(h, [0x57, 0x45, 0x42, 0x50], 8),
  },
  // DOCX is a ZIP container; the declared name must also end in .docx (checked below).
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    matches: (h) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]),
  },
  doc: {
    mime: 'application/msword',
    extension: 'doc',
    matches: (h) => startsWith(h, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
};

export interface UploadPolicy {
  name: string;
  maxBytes: number;
  kinds: FileKind[];
}

/** One place for every upload rule in the platform. */
export const UPLOAD_POLICIES = {
  CV: { name: 'CV', maxBytes: 5 * 1024 * 1024, kinds: ['pdf', 'docx', 'doc'] },
  LESSON_RESOURCE: { name: 'Lesson resource', maxBytes: 25 * 1024 * 1024, kinds: ['pdf'] },
  PAYMENT_PROOF: {
    name: 'Payment proof',
    maxBytes: 5 * 1024 * 1024,
    kinds: ['pdf', 'png', 'jpeg', 'webp'],
  },
  QUESTION_IMAGE: {
    name: 'Question image',
    maxBytes: 2 * 1024 * 1024,
    kinds: ['png', 'jpeg', 'webp'],
  },
  PROFILE_PHOTO: {
    name: 'Profile photo',
    maxBytes: 2 * 1024 * 1024,
    kinds: ['png', 'jpeg', 'webp'],
  },
} as const satisfies Record<string, UploadPolicy>;

export type UploadPolicyName = keyof typeof UPLOAD_POLICIES;

export class UploadRejectedError extends DomainError {
  readonly code = 'UPLOAD_REJECTED';
}

export interface DetectedFile {
  kind: FileKind;
  mime: string;
  extension: string;
}

export function checkUpload(
  policy: UploadPolicy,
  file: { size: number; head: Buffer; originalName: string },
): DetectedFile {
  if (file.size === 0) {
    throw new UploadRejectedError(`${policy.name} is empty`, { policy: policy.name });
  }
  if (file.size > policy.maxBytes) {
    throw new UploadRejectedError(
      `${policy.name} is larger than ${Math.round(policy.maxBytes / 1024 / 1024)} MB`,
      { policy: policy.name, maxBytes: policy.maxBytes, size: file.size },
    );
  }

  const declaredExtension = file.originalName.split('.').pop()?.toLowerCase() ?? '';
  const kind = policy.kinds.find((k) => {
    if (!KINDS[k].matches(file.head)) return false;
    return k !== 'docx' || declaredExtension === 'docx';
  });
  if (!kind) {
    throw new UploadRejectedError(`${policy.name} must be one of: ${policy.kinds.join(', ')}`, {
      policy: policy.name,
      allowed: policy.kinds,
    });
  }
  return { kind, mime: KINDS[kind].mime, extension: KINDS[kind].extension };
}

/** Safe download filename: keeps letters, digits, dot, dash, underscore and spaces. */
export function safeFilename(name: string, fallbackExtension: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `file.${fallbackExtension}`;
}
