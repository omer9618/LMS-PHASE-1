import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { buildLoggerParams } from './common/logging/logger.config';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => buildLoggerParams(env) }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ReferenceDataModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
