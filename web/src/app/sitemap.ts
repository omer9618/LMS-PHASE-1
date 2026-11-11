import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api/server';
import { catalogueListing } from '@/lib/api/schemas/catalogue';
import { siteUrl } from '@/lib/site';

// The API is not reachable while the image is built, so this is generated per request. The API
// answers are cached for a minute by serverApi.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60; // the catalogue API caps a page at 60
/** The protocol allows 50,000 URLs per file; stay well under it and under a sane crawl time. */
const MAX_COURSES = 5000;

const STATIC_PAGES = ['/', '/courses', '/teach-with-us'];

/** Public pages: the fixed ones and every published course. Empty when SITE_URL is not set. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  if (!site) return [];

  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((path) => ({
    url: `${site}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
  }));

  for (let offset = 0; offset < MAX_COURSES; offset += PAGE_SIZE) {
    const page = await serverApi.get('/catalogue/courses', catalogueListing, {
      limit: PAGE_SIZE,
      offset,
    });
    for (const course of page.items) {
      entries.push({
        url: `${site}/courses/${course.id}`,
        lastModified: course.publishedAt ?? undefined,
        changeFrequency: 'weekly',
      });
    }
    if (offset + PAGE_SIZE >= page.total) break;
  }
  return entries;
}
