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
import { AssessmentModule } from './modules/assessment/assessment.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CaptchaModule } from './modules/captcha/captcha.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { ContentModule } from './modules/content/content.module';
import { CoursesModule } from './modules/courses/courses.module';
import { EmailModule } from './modules/email/email.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProgressModule } from './modules/progress/progress.module';
// Payment verification and ledger (#63-#67, #80)
import { LedgerModule } from './modules/ledger/ledger.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { VerificationModule } from './modules/verification/verification.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { ReferenceDataModule } from './modules/reference-data/reference-data.module';
import { StorageModule } from './modules/storage/storage.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { PrismaModule } from './prisma/prisma.module';
// Profiles (#98-#100)
import { ProfilesModule } from './modules/profiles/profiles.module';
// Admin dashboard and user overview (#102, #103)
import { AdminModule } from './modules/admin/admin.module';

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
    CatalogueModule,
    EnrollmentModule,
    OrdersModule,
    // Progress and progression (#90â€“#97, #77)
    ProgressModule,
    // Assessment (#68-#76)
    AssessmentModule,
    // Profiles (#98-#100)
    ProfilesModule,
    LedgerModule,
    PayoutsModule,
    VerificationModule,
    // Admin dashboard and user overview (#102, #103)
    AdminModule,
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
