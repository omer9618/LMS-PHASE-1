import { maskEmail } from '../services/email.service';
import { EMAIL_TEMPLATES } from '.';
import { escapeHtml, renderEmail } from './layout';

describe('email rendering', () => {
  it('escapes every interpolated value in HTML', () => {
    const out = renderEmail({
      subject: 's',
      heading: '<script>alert(1)</script>',
      paragraphs: ['Tom & "Jerry"'],
      action: { label: 'Go', url: 'https://x.test/?a=1&b="2"' },
      details: [['<b>', '</b>']],
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('Tom &amp; &quot;Jerry&quot;');
    expect(out.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
    expect(out.text).toContain('Go: https://x.test/?a=1&b="2"');
  });

  it('renders templates with their links in both text and HTML', () => {
    const out = EMAIL_TEMPLATES.PASSWORD_RESET({
      resetUrl: 'https://app.test/reset?token=abc',
      expiresInMinutes: 30,
    });
    expect(out.subject).toBe('Reset your password');
    expect(out.text).toContain('https://app.test/reset?token=abc');
    expect(out.html).toContain('https://app.test/reset?token=abc');
    expect(out.text).toContain('30 minutes');
  });

  it('renders PAYOUT_RECORDED email template with amount, transaction ID, transfer date, and itemised sales coverage (#86, #113)', () => {
    const out = EMAIL_TEMPLATES.PAYOUT_RECORDED({
      amount: 'PKR 1,600.00',
      transactionId: 'HBL-TX-900',
      transferDate: '2026-04-10',
      period: '2026-04-01 to 2026-04-09',
      disputeDeadline: '2026-04-17T10:00:00.000Z',
      coveredLines: [
        ['Sale: Chemistry (LMS-AAAA-1111)', 'PKR 1,000.00'],
        ['Sale: Mathematics (LMS-BBBB-2222)', 'PKR 600.00'],
      ],
      payoutUrl: 'https://app.test/teacher/payouts/pay-1',
    });
    expect(out.subject).toBe('Payout recorded: PKR 1,600.00 (HBL-TX-900)');
    expect(out.text).toContain('Transaction ID: HBL-TX-900');
    expect(out.text).toContain('Transfer date: 2026-04-10');
    expect(out.text).toContain('Covered period: 2026-04-01 to 2026-04-09');
    expect(out.text).toContain('Sale: Chemistry (LMS-AAAA-1111): PKR 1,000.00');
    expect(out.text).toContain('Sale: Mathematics (LMS-BBBB-2222): PKR 600.00');
    expect(out.html).toContain('https://app.test/teacher/payouts/pay-1');
  });

  it('masks recipients in logs', () => {
    expect(maskEmail('teacher.a@lms.local')).toBe('t***@lms.local');
    expect(maskEmail('nonsense')).toBe('***');
    expect(escapeHtml("'")).toBe('&#39;');
  });
});
