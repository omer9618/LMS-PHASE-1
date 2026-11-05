import { Injectable } from '@nestjs/common';
import {
  contentTypeForKey,
  IncomingFile,
  StorageService,
  StoredFile,
} from '../../storage/services/storage.service';

/** Long enough for an image to load during a timed attempt; the page re-fetches after that. */
export const QUESTION_IMAGE_URL_TTL_SECONDS = 30 * 60;

/**
 * Question images (#72): stored with the QUESTION_IMAGE upload policy (PNG, JPEG or WebP, by file
 * content, up to 2 MB). `questions.content_image_url` holds the storage key. URLs are signed and
 * short-lived, and are issued only inside views the caller has already been authorised for.
 */
@Injectable()
export class QuestionImageService {
  constructor(private readonly storage: StorageService) {}

  store(quizId: string, file: IncomingFile): Promise<StoredFile> {
    return this.storage.store('QUESTION_IMAGE', `questions/${quizId}`, file);
  }

  async signedUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    const extension = key.split('.').pop() ?? 'png';
    return this.storage.downloadUrl(
      key,
      `question-image.${extension}`,
      contentTypeForKey(key),
      QUESTION_IMAGE_URL_TTL_SECONDS,
    );
  }

  /** Best effort: a failed delete leaves an orphaned file, never a broken question. */
  async deleteQuietly(keys: (string | null)[]): Promise<void> {
    for (const key of keys) {
      if (key) await this.storage.delete(key).catch(() => undefined);
    }
  }
}
