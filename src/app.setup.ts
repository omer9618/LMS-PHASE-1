import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { installBigIntJson } from './common/bigint-json';
import { requestContextMiddleware } from './common/context/request-context';
import { ENV } from './config/config.module';
import type { Env } from './config/env.schema';

/**
 * App-level setup shared by main.ts and the e2e tests, so tests run against the same app.
 * Global filter, interceptor and guards are registered as APP_* providers in AppModule instead.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const env = app.get<Env>(ENV);
  installBigIntJson();
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // Behind the VPS reverse proxy, req.ip must come from X-Forwarded-For (hop count from env).
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.enableShutdownHooks();
  return app;
}
