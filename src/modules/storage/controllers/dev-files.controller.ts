import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { OBJECT_STORAGE } from '../adapters/object-storage';
import { contentDisposition } from '../adapters/s3.storage';
import { LocalDiskStorage } from '../adapters/local-disk.storage';

/**
 * Serves files for the local storage driver only, standing in for S3 presigned URLs.
 * Registered by StorageModule only when STORAGE_DRIVER=local, which production refuses.
 * Public because the signed token is the authorisation, exactly as with S3.
 */
@Public()
@Controller('dev-files')
export class DevFilesController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: LocalDiskStorage) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const file = this.storage.verify(token);
    if (!file) throw new AppException(ErrorCode.NOT_FOUND);
    const body = await this.storage.read(file.key);
    res
      .status(200)
      .type(file.contentType)
      .setHeader('Content-Disposition', contentDisposition(file.filename))
      .send(body);
  }
}
