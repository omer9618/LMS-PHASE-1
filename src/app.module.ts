import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RATE_LIMITS } from './common/rate-limit/rate-limits';
import { buildLoggerParams } from './common/logging/logger.config';
import { ConfigModule, ENV } from './config/config.module';
import { loadEnv, type Env } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CaptchaModule } from './modules/captcha/captcha.module';
import { ContentModule } from './modules/content/content.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EmailModule } from './modules/email/email.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { StorageModule } from './modules/storage/storage.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => buildLoggerParams(env) }),
    // In-memory store: one app instance on the VPS. A shared store is only needed when scaling out.
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ name: 'default', ...RATE_LIMITS.DEFAULT }],
        skipIf: () => !env.RATE_LIMIT_ENABLED,
      }),
    }),
    PrismaModule,
    EmailModule,
    CaptchaModule,
    StorageModule.register(),
    HealthModule,
    AuthModule,
    AuditModule,
    PlatformSettingsModule,
    ReferenceDataModule,
    CoursesModule,
    TeachersModule,
    ContentModule,
    EnrollmentModule,
    // Scheduled jobs (@Cron) run only when enabled; the e2e suite turns them off.
    ...(loadEnv().JOBS_ENABLED ? [ScheduleModule.forRoot()] : []),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
