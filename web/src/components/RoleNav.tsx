'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';

/** Header links that depend on who is signed in. */
export function RoleNav() {
  const { user } = useSession();
  const pathname = usePathname() ?? '';
  const current = (href: string) => (pathname.startsWith(href) ? 'page' : undefined);
  if (!user) {
    return (
      <Link href="/teach-with-us" aria-current={current('/teach-with-us')}>
        Teach with us
      </Link>
    );
  }
  return (
    <>
      {user.roles.includes('STUDENT') && (
        <Link href="/dashboard" aria-current={current('/dashboard')}>
          My learning
        </Link>
      )}
      {user.roles.includes('TEACHER') && (
        <Link href="/teacher/courses" aria-current={current('/teacher/courses')}>
          My teaching
        </Link>
      )}
    </>
  );
}
