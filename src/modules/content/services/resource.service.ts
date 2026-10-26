import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { TransactionService } from '../../../prisma/transaction.service';
import { OutlineService } from '../../courses/services/outline.service';
import {
  contentTypeForKey,
  IncomingFile,
  StorageService,
} from '../../storage/services/storage.service';
import { LessonResourceDao, LessonResourceRecord } from '../dao/lesson-resource.dao';
import { ContentAccessService } from './content-access.service';

export type ResourceView = Omit<LessonResourceRecord, 'fileUrl'>;

const DOWNLOAD_TTL_SECONDS = 10 * 60;
const MAX_RESOURCES_PER_LESSON = 20;

/** #38 lesson file resources in object storage; #39 enrollment-gated downloads. */
@Injectable()
export class ResourceService {
  constructor(
    private readonly resourceDao: LessonResourceDao,
    private readonly storage: StorageService,
    private readonly outline: OutlineService,
    private readonly access: ContentAccessService,
    private readonly transactions: TransactionService,
  ) {}

  async upload(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    file: IncomingFile | undefined,
  ): Promise<ResourceView[]> {
    await this.outline.loadEditableLesson(user, courseId, lessonId);
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, { field: 'file' }, undefined, {
        message: 'A file is required',
      });
    }
    const existing = await this.resourceDao.getResourcesBy(lessonId);
    if (existing.length >= MAX_RESOURCES_PER_LESSON) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, undefined, undefined, {
        message: `A lesson can have at most ${MAX_RESOURCES_PER_LESSON} files`,
      });
    }

    const stored = await this.storage.store('LESSON_RESOURCE', `resources/${lessonId}`, file);
    try {
      return await this.transactions.run(async (tx) => {
        const current = await this.resourceDao.getResourcesBy(lessonId, tx);
        await this.resourceDao.createResource(
          {
            lessonId,
            fileUrl: stored.key,
            fileName: stored.filename,
            fileSizeBytes: stored.size,
            orderIndex: current.length,
          },
          tx,
        );
        return (await this.resourceDao.getResourcesBy(lessonId, tx)).map(toView);
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async remove(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<ResourceView[]> {
    await this.outline.loadEditableLesson(user, courseId, lessonId);
    const resource = await this.load(lessonId, resourceId);
    const remaining = await this.transactions.run(async (tx) => {
      await this.resourceDao.deleteResource(resource.id, tx);
      const rest = await this.resourceDao.getResourcesBy(lessonId, tx);
      await this.resourceDao.setResourceOrder(
        rest.map((r) => r.id),
        tx,
      );
      return this.resourceDao.getResourcesBy(lessonId, tx);
    });
    // After the row is gone: a failed file delete leaves an orphan, never a broken link.
    await this.storage.delete(resource.fileUrl).catch(() => undefined);
    return remaining.map(toView);
  }

  /** #39: a short-lived download link, issued only to enrolled students and staff. */
  async downloadUrl(
    user: AuthUser,
    courseId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    await this.access.assertCanDownloadResources(user, courseId, lessonId);
    const resource = await this.load(lessonId, resourceId);
    const url = await this.storage.downloadUrl(
      resource.fileUrl,
      resource.fileName,
      contentTypeForKey(resource.fileUrl),
      DOWNLOAD_TTL_SECONDS,
    );
    return { url, expiresInSeconds: DOWNLOAD_TTL_SECONDS };
  }

  private async load(lessonId: string, resourceId: string): Promise<LessonResourceRecord> {
    const resource = await this.resourceDao.getResourceBy(lessonId, resourceId);
    if (!resource)
      throw new AppException(ErrorCode.NOT_FOUND, { entity: 'resource', id: resourceId });
    return resource;
  }
}

function toView(resource: LessonResourceRecord): ResourceView {
  const { fileUrl: _key, ...view } = resource;
  return view;
}
