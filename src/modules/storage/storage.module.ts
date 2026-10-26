import { DynamicModule, Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import { loadEnv, type Env } from '../../config/env.schema';
import { DevFilesController } from './controllers/dev-files.controller';
import { LocalDiskStorage } from './adapters/local-disk.storage';
import { OBJECT_STORAGE, ObjectStorage } from './adapters/object-storage';
import { S3Storage } from './adapters/s3.storage';
import { StorageService } from './services/storage.service';

function createStorage(env: Env): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3Storage({
      bucket: env.S3_BUCKET as string,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalDiskStorage(
    env.STORAGE_LOCAL_DIR,
    env.STORAGE_SIGNING_SECRET,
    env.API_PUBLIC_URL,
  );
}

/** Global: several modules store files, and they must share one storage instance. */
@Global()
@Module({})
export class StorageModule {
  /** The dev file route exists only for the local driver, so it can never be exposed in production. */
  static register(): DynamicModule {
    const driver = loadEnv().STORAGE_DRIVER;
    return {
      module: StorageModule,
      controllers: driver === 'local' ? [DevFilesController] : [],
      providers: [
        { provide: OBJECT_STORAGE, inject: [ENV], useFactory: createStorage },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}
