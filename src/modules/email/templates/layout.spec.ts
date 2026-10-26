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

  it('masks recipients in logs', () => {
    expect(maskEmail('teacher.a@lms.local')).toBe('t***@lms.local');
    expect(maskEmail('nonsense')).toBe('***');
    expect(escapeHtml("'")).toBe('&#39;');
  });
});
