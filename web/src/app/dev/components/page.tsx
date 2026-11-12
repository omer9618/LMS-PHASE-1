import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComponentShowcase } from './ComponentShowcase';

// Not in production: the page 404s there, so its title must not leak the page's existence.
export const metadata: Metadata =
  process.env.NODE_ENV === 'production'
    ? { title: 'Page not found', robots: { index: false } }
    : { title: 'Components', robots: { index: false } };

/** #7: the base primitives in both densities. Development only: 404 in production builds. */
export default function DevComponentsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="page stack">
      <h1>Components</h1>
      <p className="muted">
        Design tokens and base primitives (#7), rendered in both densities. Development only.
      </p>
      <ComponentShowcase density="comfortable" />
      <ComponentShowcase density="compact" />
    </div>
  );
}
