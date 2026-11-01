import { renderEmail, RenderedTemplate } from './layout';

/**
 * Every email the platform sends (#111-#113). Each template takes typed data and returns subject,
 * text and HTML. Add a template here; EmailService.send is typed against this map.
 */
export const EMAIL_TEMPLATES = {
  EMAIL_VERIFICATION: (data: { verifyUrl: string; expiresInHours: number }) =>
    renderEmail({
      subject: 'Verify your email address',
      heading: 'Confirm your email',
      paragraphs: [
        'Thanks for registering. Please confirm this is your email address.',
        `The link expires in ${data.expiresInHours} hours.`,
      ],
      action: { label: 'Verify email', url: data.verifyUrl },
      footnote: "If you didn't create an account, you can ignore this email.",
    }),

  PASSWORD_RESET: (data: { resetUrl: string; expiresInMinutes: number }) =>
    renderEmail({
      subject: 'Reset your password',
      heading: 'Password reset',
      paragraphs: [
        'Someone asked to reset the password for this account.',
        `The link works once and expires in ${data.expiresInMinutes} minutes. Resetting signs you out everywhere.`,
      ],
      action: { label: 'Choose a new password', url: data.resetUrl },
      footnote: "If this wasn't you, ignore this email; your password stays the same.",
    }),

  ACCOUNT_CREATED: (data: { setPasswordUrl: string; expiresInHours: number; roles: string[] }) =>
    renderEmail({
      subject: 'Your account has been created',
      heading: 'Welcome',
      paragraphs: [
        `An administrator created an account for you (${data.roles.join(' and ').toLowerCase()}).`,
        `Choose a password to sign in. The link works once and expires in ${data.expiresInHours} hours.`,
      ],
      action: { label: 'Set your password', url: data.setPasswordUrl },
    }),

  COURSE_APPROVED: (data: { courseTitle: string; courseUrl: string }) =>
    renderEmail({
      subject: `Approved: ${data.courseTitle}`,
      heading: 'Your course is live',
      paragraphs: [`"${data.courseTitle}" was approved and is now published in the catalogue.`],
      action: { label: 'View course', url: data.courseUrl },
    }),

  COURSE_REJECTED: (data: { courseTitle: string; reason: string; courseUrl: string }) =>
    renderEmail({
      subject: `Not approved: ${data.courseTitle}`,
      heading: 'Your course was not approved',
      paragraphs: [`"${data.courseTitle}" was not approved for publication.`],
      details: [['Reason', data.reason]],
      action: { label: 'View course', url: data.courseUrl },
    }),

  COURSE_UNPUBLISHED: (data: { courseTitle: string; reason: string; courseUrl: string }) =>
    renderEmail({
      subject: `Unpublished: ${data.courseTitle}`,
      heading: 'Your course was unpublished',
      paragraphs: [
        `An administrator unpublished "${data.courseTitle}". It is back in draft and hidden from the catalogue; enrolled students keep their access.`,
        'Make the changes below and submit it for approval again.',
      ],
      details: [['Reason', data.reason]],
      action: { label: 'Edit course', url: data.courseUrl },
    }),

  ORDER_CREATED: (data: {
    paymentReference: string;
    totalMinor: string;
    currency: string;
    bankName: string;
    accountTitle: string;
    accountNumber: string;
    iban: string;
    expiresAt: string;
    orderUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: bank transfer instructions`,
      heading: 'Complete your bank transfer',
      paragraphs: [
        'Your order has been created. Transfer the exact total below and include your payment reference in the transfer remarks.',
        'Once you have made the transfer, submit your transaction ID on the order page.',
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Amount (minor units)', `${data.currency} ${data.totalMinor}`],
        ['Bank', data.bankName],
        ['Account title', data.accountTitle],
        ['Account number', data.accountNumber],
        ['IBAN', data.iban],
        ['Expires at (UTC)', data.expiresAt],
      ],
      action: { label: 'Submit payment proof', url: data.orderUrl },
    }),
} satisfies Record<string, (data: never) => RenderedTemplate>;

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;
export type EmailTemplateData<T extends EmailTemplateName> = Parameters<
  (typeof EMAIL_TEMPLATES)[T]
>[0];
