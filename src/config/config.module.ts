import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env.schema';

/** Injection token for the validated environment. Use `@Inject(ENV) env: Env`. */
export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
