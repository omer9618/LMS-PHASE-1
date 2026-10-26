/** A fully rendered email, ready to hand to a transport. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Template name, for logs and the memory transport. */
  template: string;
}

/** Delivery mechanism. Swapping provider means swapping this, nothing else. */
export interface EmailTransport {
  send(email: OutgoingEmail & { from: string }): Promise<void>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');
