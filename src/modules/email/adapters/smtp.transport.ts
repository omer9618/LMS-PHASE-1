import nodemailer, { Transporter } from 'nodemailer';
import type { EmailTransport, OutgoingEmail } from './email-transport';

/** Any SMTP provider (SES, Postmark, Brevo, Mailgun...), configured by SMTP_URL. */
export class SmtpTransport implements EmailTransport {
  private readonly transporter: Transporter;

  constructor(smtpUrl: string) {
    this.transporter = nodemailer.createTransport(smtpUrl);
  }

  async send(email: OutgoingEmail & { from: string }): Promise<void> {
    await this.transporter.sendMail({
      from: email.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { 'X-LMS-Template': email.template },
    });
  }
}
