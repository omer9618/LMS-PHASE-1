import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { EMAIL_TRANSPORT, EmailTransport } from './adapters/email-transport';
import { LogTransport } from './adapters/log.transport';
import { MemoryTransport } from './adapters/memory.transport';
import { SmtpTransport } from './adapters/smtp.transport';
import { EmailService } from './services/email.service';

/** Global: many modules send email, and the transport must be a single shared instance. */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      inject: [ENV, PinoLogger],
      useFactory: (env: Env, logger: PinoLogger): EmailTransport => {
        switch (env.EMAIL_TRANSPORT) {
          case 'smtp':
            return new SmtpTransport(env.SMTP_URL as string);
          case 'memory':
            return new MemoryTransport();
          case 'log':
            logger.setContext('LogTransport');
            return new LogTransport(logger);
        }
      },
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
