import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogueBrowser } from '@/components/catalogue/CatalogueBrowser';

export const metadata: Metadata = {
  title: 'Courses',
  description: 'Cambridge and Edexcel courses from independent teachers.',
};

export default function CoursesPage() {
  // Filter state lives in the query string (#42), read on the client with useSearchParams.
  return (
    <Suspense
      fallback={
        <div className="page">
          <h1>Courses</h1>
        </div>
      }
    >
      <CatalogueBrowser />
    </Suspense>
  );
}
