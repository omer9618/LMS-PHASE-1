/**
 * The public address of the web app (SITE_URL, e.g. https://paperlane.example), without a trailing
 * slash; null when it is not set. Needed only where a page must name itself absolutely, such as the
 * sitemap, which cannot use relative links.
 */
export function siteUrl(): string | null {
  const value = process.env.SITE_URL?.trim().replace(/\/+$/, '');
  return value ? value : null;
}
