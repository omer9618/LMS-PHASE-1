export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface EmailContent {
  subject: string;
  heading: string;
  /** Plain-text paragraphs. Escaped for HTML; never pass markup. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Label/value rows, e.g. amounts and references. */
  details?: Array<[label: string, value: string]>;
  footnote?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** One consistent layout for every email, as both HTML and plain text. */
export function renderEmail(content: EmailContent): RenderedTemplate {
  const textParts = [content.heading, '', ...content.paragraphs];
  const htmlParts = [
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(content.heading)}</h1>`,
    ...content.paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`),
  ];

  if (content.details?.length) {
    textParts.push('', ...content.details.map(([label, value]) => `${label}: ${value}`));
    htmlParts.push(
      `<table style="border-collapse:collapse;margin:8px 0 16px">${content.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(label)}</td>` +
            `<td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`,
        )
        .join('')}</table>`,
    );
  }

  if (content.action) {
    textParts.push('', `${content.action.label}: ${content.action.url}`);
    htmlParts.push(
      `<p style="margin:16px 0"><a href="${escapeHtml(content.action.url)}" ` +
        `style="background:#1f4fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">` +
        `${escapeHtml(content.action.label)}</a></p>`,
    );
  }

  if (content.footnote) {
    textParts.push('', content.footnote);
    htmlParts.push(
      `<p style="margin:24px 0 0;color:#777;font-size:12px">${escapeHtml(content.footnote)}</p>`,
    );
  }

  return {
    subject: content.subject,
    text: textParts.join('\n'),
    html:
      `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;` +
      `max-width:560px;margin:0 auto;padding:24px">${htmlParts.join('')}</body></html>`,
  };
}
