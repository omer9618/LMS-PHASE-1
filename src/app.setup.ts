import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { installBigIntJson } from './common/bigint-json';

/**
 * App-level setup shared by main.ts and the e2e tests, so tests run against the same app.
 * Global filter, interceptor and guards are registered as APP_* providers in AppModule instead.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  installBigIntJson();
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.enableShutdownHooks();
  return app;
}
