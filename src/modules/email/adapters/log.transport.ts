import type { PinoLogger } from 'nestjs-pino';
import type { EmailTransport, OutgoingEmail } from './email-transport';

/** Development: prints the email (including links) to the log instead of sending it. */
export class LogTransport implements EmailTransport {
  constructor(private readonly logger: PinoLogger) {}

  async send(email: OutgoingEmail & { from: string }): Promise<void> {
    this.logger.info(
      { to: email.to, template: email.template, subject: email.subject, text: email.text },
      'Email (log transport, not sent)',
    );
  }
}
