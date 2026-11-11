import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';

export const metadata: Metadata = { title: 'Course not found', robots: { index: false } };

/** A course that does not exist, or is not published (the API answers 404 for both). */
export default function CourseNotFound() {
  return (
    <div className="page stack">
      <h1>Course not found</h1>
      <p>It may have been unpublished, or the link is mistyped.</p>
      <p>
        <ButtonLink href="/courses">Browse all courses</ButtonLink>
      </p>
    </div>
  );
}
