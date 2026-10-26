import type { EmailTransport, OutgoingEmail } from './email-transport';

/** Tests: keeps sent emails in memory so e2e tests can assert on them (and follow links). */
export class MemoryTransport implements EmailTransport {
  readonly sent: Array<OutgoingEmail & { from: string }> = [];

  async send(email: OutgoingEmail & { from: string }): Promise<void> {
    this.sent.push(email);
  }

  /** Most recent email to `to`, optionally of a given template. */
  lastTo(to: string, template?: string): (OutgoingEmail & { from: string }) | undefined {
    return [...this.sent]
      .reverse()
      .find(
        (e) => e.to.toLowerCase() === to.toLowerCase() && (!template || e.template === template),
      );
  }
}
