import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="page stack">
      <h1>Page not found</h1>
      <p>
        The page you asked for does not exist. <Link href="/courses">Browse courses</Link>
      </p>
    </div>
  );
}
