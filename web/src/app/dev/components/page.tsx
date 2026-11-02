import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComponentShowcase } from './ComponentShowcase';

export const metadata: Metadata = { title: 'Components', robots: { index: false } };

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
