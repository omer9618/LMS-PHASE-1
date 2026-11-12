'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ButtonLink, Forbidden, SignInGate } from '@/components/ui';
import { useSession } from '@/lib/session';

/** The teacher area needs a signed-in teacher. The API enforces this too (403 for others). */
export function TeacherGuard({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const pathname = usePathname() ?? '/teacher/courses';
  if (status === 'loading') {
    return (
      <p role="status" className="page">
        Loading…
      </p>
    );
  }
  if (!user) {
    return (
      <div className="page">
        <SignInGate next={pathname}>Sign in with your teacher account.</SignInGate>
      </div>
    );
  }
  if (!user.roles.includes('TEACHER')) {
    return (
      <div className="page">
        <Forbidden
          title="This area is for teachers"
          actions={
            <>
              <ButtonLink href="/teach-with-us">Apply to teach</ButtonLink>
              <ButtonLink href="/dashboard" variant="secondary">
                Go to My learning
              </ButtonLink>
            </>
          }
        >
          You are signed in as {user.email}, which does not have the Teacher role.
        </Forbidden>
      </div>
    );
  }
  return <>{children}</>;
}
