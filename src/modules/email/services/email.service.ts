import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { EMAIL_TRANSPORT, EmailTransport } from '../adapters/email-transport';
import { EMAIL_TEMPLATES, EmailTemplateData, EmailTemplateName } from '../templates';

/**
 * Sends templated email (#110). Delivery is best-effort: a failure is logged with the template,
 * the masked recipient and the request id, and reported as `false`, never thrown. Call it after
 * the transaction that caused it has committed, so a rolled-back change never emails anyone.
 */
@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    @Inject(ENV) private readonly env: Env,
    @InjectPinoLogger(EmailService.name) private readonly logger: PinoLogger,
  ) {}

  async send<T extends EmailTemplateName>(
    to: string,
    template: T,
    data: EmailTemplateData<T>,
  ): Promise<boolean> {
    const render = EMAIL_TEMPLATES[template] as (d: EmailTemplateData<T>) => {
      subject: string;
      text: string;
      html: string;
    };
    const rendered = render(data);
    try {
      await this.transport.send({ ...rendered, to, template, from: this.env.EMAIL_FROM });
      this.logger.info({ template, to: maskEmail(to) }, 'Email sent');
      return true;
    } catch (err) {
      this.logger.error({ err, template, to: maskEmail(to) }, 'Email delivery failed');
      return false;
    }
  }

  /** Absolute URL into the web app, for links in emails. */
  appUrl(path: string, query: Record<string, string> = {}): string {
    const url = new URL(path, this.env.APP_PUBLIC_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }
}

/** a***@example.com: enough to diagnose, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
