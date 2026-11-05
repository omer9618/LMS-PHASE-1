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

  // ── Orders and payment (#112) ──
  ORDER_CREATED: (data: {
    paymentReference: string;
    amount: string;
    courses: string;
    bankTransferInstructions: string;
    expiresAt: string;
    orderUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: how to pay`,
      heading: 'Complete your bank transfer',
      paragraphs: [
        `Thanks for your order (${data.courses}). Transfer the exact amount below and use your payment reference as the transfer remark.`,
        ...data.bankTransferInstructions.split(/\r?\n/).filter((line) => line.trim() !== ''),
        'Once you have paid, submit your transaction ID on the order page.',
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Amount', data.amount],
        ['Pay by (UTC)', data.expiresAt],
      ],
      action: { label: 'View order', url: data.orderUrl },
      footnote: 'Unpaid orders expire after the date above.',
    }),

  PAYMENT_PROOF_RECEIVED: (data: {
    paymentReference: string;
    transactionId: string;
    turnaroundHours: number;
    orderUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: payment proof received`,
      heading: 'We received your payment proof',
      paragraphs: [
        `We will check your transfer, usually within ${data.turnaroundHours} hours, and email you when it is confirmed.`,
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Transaction ID', data.transactionId],
      ],
      action: { label: 'View order', url: data.orderUrl },
    }),

  PAYMENT_CONFIRMED: (data: { paymentReference: string; amount: string; orderUrl: string }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: payment confirmed`,
      heading: 'Your payment is confirmed',
      paragraphs: ['Thank you. Your payment has been verified and your courses are unlocked.'],
      details: [
        ['Payment reference', data.paymentReference],
        ['Amount', data.amount],
      ],
      action: { label: 'View order', url: data.orderUrl },
    }),

  ORDER_RECEIPT: (data: {
    receiptNumber: string;
    paymentReference: string;
    issuedAt: string;
    lines: Array<[course: string, amount: string]>;
    total: string;
    receiptUrl: string;
  }) =>
    renderEmail({
      subject: `Receipt ${data.receiptNumber}`,
      heading: 'Your receipt',
      paragraphs: [`Receipt for order ${data.paymentReference}.`],
      details: [
        ['Receipt number', data.receiptNumber],
        ['Issued (UTC)', data.issuedAt],
        ...data.lines,
        ['Total paid', data.total],
      ],
      action: { label: 'View receipt', url: data.receiptUrl },
    }),

  ENROLLMENT_GRANTED: (data: { courses: string; libraryUrl: string }) =>
    renderEmail({
      subject: 'You are enrolled',
      heading: 'Your courses are ready',
      paragraphs: [`You now have access to: ${data.courses}.`],
      action: { label: 'Start learning', url: data.libraryUrl },
    }),

  PAYMENT_REJECTED: (data: {
    paymentReference: string;
    reason: string;
    notes: string;
    expiresAt: string;
    orderUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: payment not accepted`,
      heading: 'We could not verify your payment',
      paragraphs: [
        'Please check the reason below and submit a corrected transaction ID or proof on the same order.',
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Reason', data.reason],
        ...(data.notes ? ([['Notes', data.notes]] as Array<[string, string]>) : []),
        ['Resubmit by (UTC)', data.expiresAt],
      ],
      action: { label: 'Resubmit proof', url: data.orderUrl },
      footnote: 'If nothing is submitted by the date above, the order expires.',
    }),

  PAYMENT_TOP_UP_REQUESTED: (data: {
    paymentReference: string;
    total: string;
    shortfall: string;
    expiresAt: string;
    orderUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference}: top-up needed`,
      heading: 'Your payment was short',
      paragraphs: [
        'We received less than the order total. Transfer the remaining amount with the same payment reference, then submit the new transaction ID.',
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Order total', data.total],
        ['Still to pay', data.shortfall],
        ['Pay by (UTC)', data.expiresAt],
      ],
      action: { label: 'Submit top-up proof', url: data.orderUrl },
    }),

  ORDER_LAPSED: (data: {
    paymentReference: string;
    amount: string;
    courses: string;
    catalogueUrl: string;
  }) =>
    renderEmail({
      subject: `Order ${data.paymentReference} has expired`,
      heading: 'Your order has expired',
      paragraphs: [
        `Your order for ${data.courses} expired because no payment was received in time.`,
        'If you still want these courses, place a new order.',
      ],
      details: [
        ['Payment reference', data.paymentReference],
        ['Amount', data.amount],
      ],
      action: { label: 'Browse courses', url: data.catalogueUrl },
    }),
  // ── end Orders and payment ──

  // ── Payouts (#86, #113) ──
  PAYOUT_RECORDED: (data: {
    amount: string;
    transactionId: string;
    transferDate: string;
    period: string | null;
    disputeDeadline: string;
    coveredLines: Array<[item: string, netAmount: string]>;
    payoutUrl: string;
  }) =>
    renderEmail({
      subject: `Payout recorded: ${data.amount} (${data.transactionId})`,
      heading: 'Your payout has been recorded',
      paragraphs: [
        `We have transferred ${data.amount} to your account. Below are the transfer details and itemised sales coverage.`,
        `If anything looks wrong, you can raise a concern on your payouts page before ${data.disputeDeadline} (UTC).`,
      ],
      details: [
        ['Amount', data.amount],
        ['Transaction ID', data.transactionId],
        ['Transfer date', data.transferDate],
        ...(data.period ? ([['Covered period', data.period]] as Array<[string, string]>) : []),
        ...data.coveredLines,
        ['Dispute deadline (UTC)', data.disputeDeadline],
      ],
      action: { label: 'View payout', url: data.payoutUrl },
      footnote:
        'After the dispute deadline passes with no open concern, the payout is marked accepted automatically.',
    }),
  // ── end Payouts ──
} satisfies Record<string, (data: never) => RenderedTemplate>;

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;
export type EmailTemplateData<T extends EmailTemplateName> = Parameters<
  (typeof EMAIL_TEMPLATES)[T]
>[0];
