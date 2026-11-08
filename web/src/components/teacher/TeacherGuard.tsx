'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Alert } from '@/components/ui';
import { useSession } from '@/lib/session';

/** The teacher area needs a signed-in teacher. The API enforces this too (403 for others). */
export function TeacherGuard({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const pathname = usePathname() ?? '/teacher/courses';
  if (status === 'loading') return <p role="status">Loading…</p>;
  if (!user) {
    return (
      <div className="stack">
        <h1>Teaching</h1>
        <p>
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link> with your
          teacher account.
        </p>
      </div>
    );
  }
  if (!user.roles.includes('TEACHER')) {
    return (
      <div className="stack">
        <h1>Teaching</h1>
        <Alert tone="warning">
          This area is for teachers. Want to teach? <Link href="/teach-with-us">Apply here</Link>.
        </Alert>
      </div>
    );
  }
  return <>{children}</>;
}
