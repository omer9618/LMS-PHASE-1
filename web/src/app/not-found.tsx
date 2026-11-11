import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="page stack">
      <h1>Page not found</h1>
      <p>The page you asked for does not exist, or it has moved.</p>
      <p>
        <ButtonLink href="/courses">Browse courses</ButtonLink>
      </p>
    </div>
  );
}
