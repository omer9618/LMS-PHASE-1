import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// Read at request time: SITE_URL is set when the container starts, not when the image is built.
export const dynamic = 'force-dynamic';

/** Private areas are not for search engines; the catalogue, course pages and teacher profiles are. */
const PRIVATE_PATHS = [
  '/admin',
  '/teacher',
  '/dashboard',
  '/learn',
  '/cart',
  '/orders',
  '/account',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/api/',
];

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
