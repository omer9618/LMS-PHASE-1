import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env.schema';

async function bootstrap(): Promise<void> {
  // Validate before Nest starts so a bad config fails with one readable message.
  const env = loadEnv();
  // rawBody: webhook signatures (Bunny #36) are computed over the exact request bytes.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  configureApp(app);
  await app.listen(env.PORT);
}

void bootstrap();
