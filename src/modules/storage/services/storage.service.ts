import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, ObjectStorage } from '../adapters/object-storage';
import {
  checkUpload,
  DetectedFile,
  safeFilename,
  UPLOAD_POLICIES,
  UploadPolicyName,
} from '../domain/upload-policy';

/** The minimal view of an uploaded file (matches Express.Multer.File) the service needs. */
export interface IncomingFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

export interface StoredFile extends DetectedFile {
  key: string;
  filename: string;
  size: number;
}

const DEFAULT_URL_TTL_SECONDS = 15 * 60;

/**
 * Validates and stores uploads, and issues signed download URLs.
 * Database columns named `*_url` for files (cv_url, file_url, proof_file_url, ...) hold the
 * storage key returned here, never a public URL: every download goes through `downloadUrl`.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  /** Checks the file against the named policy and stores it under `prefix/`. */
  async store(
    policyName: UploadPolicyName,
    prefix: string,
    file: IncomingFile,
  ): Promise<StoredFile> {
    const detected = checkUpload(UPLOAD_POLICIES[policyName], {
      size: file.size,
      head: file.buffer.subarray(0, 16),
      originalName: file.originalname,
    });
    const key = `${prefix}/${randomUUID()}.${detected.extension}`;
    await this.storage.put(key, file.buffer, detected.mime);
    return {
      ...detected,
      key,
      filename: safeFilename(file.originalname, detected.extension),
      size: file.size,
    };
  }

  downloadUrl(
    key: string,
    filename: string,
    contentType: string,
    expiresInSeconds = DEFAULT_URL_TTL_SECONDS,
  ): Promise<string> {
    return this.storage.signedDownloadUrl(key, { filename, contentType, expiresInSeconds });
  }

  delete(key: string): Promise<void> {
    return this.storage.delete(key);
  }
}

/** The content type for a stored key, from the extension StorageService gave it. */
export function contentTypeForKey(key: string): string {
  const extension = key.split('.').pop();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    default:
      return 'application/octet-stream';
  }
}
