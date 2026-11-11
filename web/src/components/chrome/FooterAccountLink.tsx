'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session';

/** The footer's account link: "Sign in" for visitors, "Your account" once signed in. */
export function FooterAccountLink() {
  const { user } = useSession();
  return user ? <Link href="/account">Your account</Link> : <Link href="/login">Sign in</Link>;
}
