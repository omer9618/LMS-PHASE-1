import type { NestExpressApplication } from '@nestjs/platform-express';
import { EMAIL_TRANSPORT } from '../../src/modules/email/adapters/email-transport';
import type { MemoryTransport } from '../../src/modules/email/adapters/memory.transport';

/** The in-memory email transport the e2e app runs with (EMAIL_TRANSPORT=memory). */
export function mailbox(app: NestExpressApplication): MemoryTransport {
  return app.get<MemoryTransport>(EMAIL_TRANSPORT);
}

/** The `token` query parameter from the link in the most recent matching email. */
export function tokenFromLastEmail(
  app: NestExpressApplication,
  to: string,
  template: string,
): string {
  const email = mailbox(app).lastTo(to, template);
  if (!email) throw new Error(`No ${template} email to ${to}`);
  const match = email.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No token link in ${template} email`);
  return match[1];
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}
